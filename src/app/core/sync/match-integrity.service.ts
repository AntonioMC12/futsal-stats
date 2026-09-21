import { DestroyRef, inject, Injectable } from '@angular/core';
import { CLOUD_CONFIG } from '../cloud/cloud.config';
import { SupabaseClientService } from '../cloud/supabase-client.service';
import { FutsalStatsDb } from '../persistence/local/futsal-stats.db';
import {
  fromLocalMatchEventRecord,
  fromLocalMatchRecord,
} from '../persistence/local/local-record-mappers';
import { TeamAccessService } from '../team-workspace/team-access.service';
import { OfflineSyncService } from './offline-sync.service';
import { enqueueSyncOperation } from './sync-queue';
import {
  integritySignature,
  MatchIntegrityReport,
  MatchIntegrityStatus,
} from './match-integrity.model';

@Injectable({ providedIn: 'root' })
export class MatchIntegrityService {
  private readonly db = inject(FutsalStatsDb);
  private readonly config = inject(CLOUD_CONFIG);
  private readonly client = inject(SupabaseClientService);
  private readonly access = inject(TeamAccessService);
  private readonly sync = inject(OfflineSyncService);
  private readonly destroyRef = inject(DestroyRef);
  private recovering = false;

  constructor() {
    if (this.config.mode !== 'cloud') return;
    const resume = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible')
        void this.recover().catch((error) =>
          console.warn('[INTEGRITY] resume recovery failed', String(error)),
        );
    };
    globalThis.addEventListener?.('focus', resume);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', resume);
    this.destroyRef.onDestroy(() => {
      globalThis.removeEventListener?.('focus', resume);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', resume);
    });
  }

  async getIntegrityStatus(matchId: string): Promise<MatchIntegrityStatus> {
    return (await this.db.matchIntegrity.get(matchId))?.status ?? 'unknown';
  }

  async verify(matchId: string): Promise<MatchIntegrityReport> {
    const localMatch = await this.db.matches.get(matchId);
    if (!localMatch) throw new Error('El partido no existe en este dispositivo.');
    const localEvents = await this.db.events.where('matchId').equals(matchId).toArray();
    const localEventIds = localEvents.map((event) => event.id).sort();
    const localLineupIds = localEvents
      .filter(hasLineup)
      .map((event) => event.id)
      .sort();
    const localPlayerIds = [...localMatch.squadPlayerIds].sort();
    const snapshot = await this.db.matchIntegrity.get(matchId);
    const queue = (await this.db.syncQueue.toArray()).filter(
      (item) => item.operation.entityId === matchId,
    );
    const sync = {
      pendingCount: queue.filter((item) => item.status === 'pending').length,
      failedCount: queue.filter((item) => item.status === 'failed').length,
      lastError: queue.find((item) => item.lastError)?.lastError ?? null,
    };
    const base = {
      matchId,
      teamId: localMatch.teamId,
      checkedAt: Date.now(),
      local: {
        matchExists: true,
        eventIds: localEventIds,
        lineupEventIds: localLineupIds,
        matchPlayerIds: localPlayerIds,
        status: localMatch.status,
      },
      sync,
      checksumLocal: integritySignature(matchId, localEventIds, localLineupIds, localPlayerIds),
      repairAvailable: Boolean(snapshot),
    };
    console.info('[INTEGRITY] verify start', {
      matchId,
      teamId: localMatch.teamId,
      eventCount: localEventIds.length,
      pendingCount: sync.pendingCount,
      failedCount: sync.failedCount,
    });
    try {
      if (this.config.mode !== 'cloud' || !this.sync.online())
        throw new Error('Nube no disponible');
      const cloud = await this.readCloud(matchId, localMatch.teamId);
      if (cloud.matchExists && cloud.teamId !== localMatch.teamId)
        throw new Error('El partido remoto pertenece a otro equipo.');
      const expectedEventIds =
        snapshot?.expectedEventIds ?? cloud.manifest?.eventIds ?? localEventIds;
      const expectedLineupIds =
        snapshot?.expectedLineupEventIds ?? cloud.manifest?.lineupEventIds ?? localLineupIds;
      const expectedPlayerIds =
        snapshot?.expectedMatchPlayerIds ?? cloud.manifest?.playerIds ?? localPlayerIds;
      const expectedChecksum = integritySignature(
        matchId,
        expectedEventIds,
        expectedLineupIds,
        expectedPlayerIds,
      );
      const missingEventIds = difference(expectedEventIds, cloud.eventIds);
      const missingLineupEventIds = difference(expectedLineupIds, cloud.lineupEventIds);
      const unexpectedCloudEventIds = difference(cloud.eventIds, expectedEventIds);
      const unexpectedCloudLineupEventIds = difference(cloud.lineupEventIds, expectedLineupIds);
      const unexpectedCloudMatchPlayerIds = difference(cloud.matchPlayerIds, expectedPlayerIds);
      const checksumCloud = cloud.matchExists
        ? integritySignature(matchId, cloud.eventIds, cloud.lineupEventIds, cloud.matchPlayerIds)
        : null;
      const baselineMatches = snapshot
        ? snapshot.checksum === base.checksumLocal
        : expectedChecksum === base.checksumLocal;
      const same =
        cloud.matchExists &&
        cloud.status === 'finished' &&
        cloud.teamId === localMatch.teamId &&
        checksumCloud === expectedChecksum &&
        baselineMatches &&
        Boolean(cloud.manifest) &&
        integritySignature(
          matchId,
          cloud.manifest!.eventIds,
          cloud.manifest!.lineupEventIds,
          cloud.manifest!.playerIds,
        ) === expectedChecksum &&
        cloud.manifest?.checksum === expectedChecksum;
      // A cache populated from cloud cannot prove that cloud has every event ever captured.
      const status: MatchIntegrityReport['status'] =
        localMatch.status !== 'finished' || (!snapshot && !cloud.manifest)
          ? 'unknown'
          : same
            ? 'verified'
            : 'mismatch';
      const report: MatchIntegrityReport = {
        ...base,
        cloud: {
          reachable: true,
          matchExists: cloud.matchExists,
          eventIds: cloud.eventIds,
          lineupEventIds: cloud.lineupEventIds,
          matchPlayerIds: cloud.matchPlayerIds,
          status: cloud.status,
        },
        status,
        repairAvailable:
          Boolean(snapshot) &&
          unexpectedCloudEventIds.length === 0 &&
          unexpectedCloudLineupEventIds.length === 0 &&
          unexpectedCloudMatchPlayerIds.length === 0,
        missingEventIds,
        missingLineupEventIds,
        unexpectedCloudEventIds,
        unexpectedCloudLineupEventIds,
        unexpectedCloudMatchPlayerIds,
        checksumCloud,
      };
      await this.setStatus(matchId, status, report.checkedAt, null);
      console.info(
        status === 'verified' ? '[INTEGRITY] verification success' : '[INTEGRITY] mismatch',
        { matchId, eventCount: localEventIds.length, missingCount: missingEventIds.length },
      );
      return report;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const report: MatchIntegrityReport = {
        ...base,
        cloud: {
          reachable: false,
          matchExists: false,
          eventIds: [],
          lineupEventIds: [],
          matchPlayerIds: [],
          status: null,
        },
        status: 'unreachable',
        missingEventIds: [],
        missingLineupEventIds: [],
        unexpectedCloudEventIds: [],
        unexpectedCloudLineupEventIds: [],
        unexpectedCloudMatchPlayerIds: [],
        checksumCloud: null,
      };
      await this.setStatus(matchId, 'unreachable', report.checkedAt, message);
      console.warn('[INTEGRITY] cloud unavailable', { matchId, message });
      return report;
    }
  }

  async repair(matchId: string): Promise<MatchIntegrityReport> {
    const match = await this.db.matches.get(matchId);
    if (!match) throw new Error('El partido no existe en este dispositivo.');
    await this.access.assertCanWrite(match.teamId);
    const before = await this.verify(matchId);
    if (!before.cloud.reachable || before.status === 'verified' || before.status === 'unknown')
      return before;
    if (!(await this.db.matchIntegrity.get(matchId)))
      throw new Error('La reparación requiere el snapshot original de este dispositivo.');
    if (
      before.unexpectedCloudEventIds.length ||
      before.unexpectedCloudLineupEventIds.length ||
      before.unexpectedCloudMatchPlayerIds.length
    )
      throw new Error('Existen datos remotos desconocidos; se requiere revisión manual.');
    const missingIds = new Set([...before.missingEventIds, ...before.missingLineupEventIds]);
    const events = (await this.db.events.where('matchId').equals(matchId).toArray())
      .filter((event) => missingIds.has(event.id))
      .map(fromLocalMatchEventRecord)
      .sort((a, b) => a.sequence - b.sequence);
    const localMatch = fromLocalMatchRecord(match);
    console.info('[INTEGRITY] repair start', {
      matchId,
      teamId: match.teamId,
      missingCount: events.length,
    });
    await this.db.transaction(
      'rw',
      this.db.syncQueue,
      this.db.matches,
      this.db.events,
      this.db.matchIntegrity,
      async () => {
        const needsMatchWrite =
          !before.cloud.matchExists ||
          before.cloud.status !== localMatch.status ||
          before.missingEventIds.length > 0 ||
          before.missingLineupEventIds.length > 0 ||
          difference(localMatch.squadPlayerIds, before.cloud.matchPlayerIds).length > 0;
        if (needsMatchWrite) {
          const key = `match-events:${matchId}`;
          const existing = await this.db.syncQueue.where('dedupeKey').equals(key).first();
          const operation = {
            kind: 'match-events-commit' as const,
            teamId: match.teamId,
            entityId: matchId,
            match: localMatch,
            events,
          };
          if (existing) {
            const now = Date.now();
            await this.db.syncQueue.put({
              ...existing,
              operation,
              status: 'pending',
              attempts: 0,
              nextAttemptAt: now,
              lastError: null,
              updatedAt: Math.max(now, existing.updatedAt + 1),
            });
          } else {
            await enqueueSyncOperation(this.db.syncQueue, operation);
          }
          await this.db.matches.update(matchId, { syncStatus: 'pending' });
        }
        const snapshot = await this.db.matchIntegrity.get(matchId);
        if (snapshot)
          await enqueueSyncOperation(this.db.syncQueue, {
            kind: 'match-integrity-manifest',
            teamId: match.teamId,
            entityId: matchId,
            snapshot,
          });
        for (const event of events)
          await this.db.events.update(event.id, { syncStatus: 'pending' });
        await this.db.matchIntegrity.update(matchId, { status: 'repairing', lastError: null });
      },
    );
    for (const event of events)
      console.info('[INTEGRITY] event requeued', { matchId, eventId: event.id });
    await this.sync.syncNow();
    const after = await this.verify(matchId);
    console.info('[INTEGRITY] repair finished', {
      matchId,
      status: after.status,
      missingCount: after.missingEventIds.length,
    });
    return after;
  }

  /** Recheck unfinished verifications after startup or resume; the outbox remains the durable repair intent. */
  async recover(): Promise<void> {
    if (this.config.mode !== 'cloud') return;
    if (this.recovering) return;
    this.recovering = true;
    try {
      await this.sync.syncNow();
      const snapshots = await this.db.matchIntegrity
        .where('status')
        .anyOf('pending', 'repairing', 'mismatch', 'unreachable')
        .toArray();
      for (const snapshot of snapshots) {
        try {
          const report = await this.verify(snapshot.matchId);
          if (
            report.status === 'mismatch' &&
            report.unexpectedCloudEventIds.length === 0 &&
            report.unexpectedCloudLineupEventIds.length === 0 &&
            report.unexpectedCloudMatchPlayerIds.length === 0
          )
            await this.repair(snapshot.matchId);
        } catch (error) {
          console.warn('[INTEGRITY] recovery failed', {
            matchId: snapshot.matchId,
            error: String(error),
          });
        }
      }
    } finally {
      this.recovering = false;
    }
  }

  private async setStatus(
    matchId: string,
    status: MatchIntegrityStatus,
    checkedAt: number,
    lastError: string | null,
  ): Promise<void> {
    const snapshot = await this.db.matchIntegrity.get(matchId);
    if (snapshot) await this.db.matchIntegrity.update(matchId, { status, checkedAt, lastError });
  }

  private async readCloud(
    matchId: string,
    teamId: string,
  ): Promise<{
    matchExists: boolean;
    teamId: string | null;
    status: string | null;
    eventIds: string[];
    lineupEventIds: string[];
    matchPlayerIds: string[];
    manifest: {
      eventIds: string[];
      lineupEventIds: string[];
      playerIds: string[];
      checksum: string;
    } | null;
  }> {
    const client = this.client.requireClient();
    const teamResult = await client.from('teams').select('id').eq('id', teamId).maybeSingle();
    if (teamResult.error) throw teamResult.error;
    if (!teamResult.data) throw new Error('El Team no está accesible con la sesión actual.');
    const matchResult = await client
      .from('matches')
      .select('id,team_id,status')
      .eq('id', matchId)
      .maybeSingle();
    if (matchResult.error) throw matchResult.error;
    const eventResult = await client
      .from('match_events')
      .select('id')
      .eq('match_id', matchId)
      .is('deleted_at', null);
    if (eventResult.error) throw eventResult.error;
    const playerResult = await client
      .from('match_players')
      .select('player_id')
      .eq('match_id', matchId)
      .eq('in_squad', true);
    if (playerResult.error) throw playerResult.error;
    const manifestResult = await client
      .from('match_integrity_manifests')
      .select('expected_event_ids,expected_lineup_event_ids,expected_player_ids,checksum')
      .eq('match_id', matchId)
      .maybeSingle();
    if (manifestResult.error) throw manifestResult.error;
    const eventIds = (eventResult.data ?? []).map((row) => row.id).sort();
    let lineupEventIds: string[] = [];
    if (eventIds.length) {
      const lineupResult = await client
        .from('match_event_lineup_players')
        .select('event_id')
        .in('event_id', eventIds);
      if (lineupResult.error) throw lineupResult.error;
      lineupEventIds = [...new Set((lineupResult.data ?? []).map((row) => row.event_id))].sort();
    }
    const row = manifestResult.data;
    return {
      matchExists: Boolean(matchResult.data),
      teamId: matchResult.data?.team_id ?? null,
      status: matchResult.data?.status ?? null,
      eventIds,
      lineupEventIds,
      matchPlayerIds: (playerResult.data ?? []).map((item) => item.player_id).sort(),
      manifest: row
        ? {
            eventIds: row.expected_event_ids as string[],
            lineupEventIds: row.expected_lineup_event_ids as string[],
            playerIds: row.expected_player_ids as string[],
            checksum: row.checksum,
          }
        : null,
    };
  }
}

function difference(left: readonly string[], right: readonly string[]): string[] {
  const included = new Set(right);
  return left.filter((id) => !included.has(id));
}

function hasLineup(event: { id: string; lineupPlayerIds?: readonly string[] }): boolean {
  return Array.isArray(event.lineupPlayerIds) && event.lineupPlayerIds.length > 0;
}
