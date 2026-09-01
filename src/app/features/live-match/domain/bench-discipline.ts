import { DomainResult, fail, ok } from '../../../core/utils/result';
import { Match } from '../../../shared/models/match';
import {
  BenchDisciplineAction,
  BenchDisciplineEvent,
  BenchDisciplineReason,
  BenchDisciplineSubjectKind,
  FoulTeam,
  StaffRole,
} from '../../../shared/models/match-event';

export const STAFF_ROLES: readonly StaffRole[] = [
  'headCoach',
  'assistantCoach',
  'delegate',
  'fitnessCoach',
  'physiotherapist',
  'doctor',
  'other',
];

export type BenchDisciplineSubject =
  | { subjectKind: 'player'; playerId: string }
  | { subjectKind: 'opponentPlayer'; opponentPlayerNumber: number }
  | { subjectKind: 'staff'; staffRole: StaffRole; staffName?: string };

export interface RegisterBenchDisciplineInput {
  match: Match;
  team: FoulTeam;
  subjectKind: BenchDisciplineSubjectKind;
  playerId?: string;
  opponentPlayerNumber?: number;
  staffRole?: StaffRole;
  staffName?: string;
  disciplinaryAction: BenchDisciplineAction;
  reason: BenchDisciplineReason;
  currentPeriodFoulCount: number;
  currentLineupPlayerIds: readonly string[];
  currentYellowCards: number;
  subjectSentOff: boolean;
  gameClockMs: number;
  timestamp: number;
  sequence: number;
  eventId: string;
}

export function registerBenchDiscipline(
  input: RegisterBenchDisciplineInput,
): DomainResult<{ match: Match; event: BenchDisciplineEvent }> {
  if (input.match.status !== 'firstHalf' && input.match.status !== 'secondHalf') {
    return fail('La disciplina de banquillo solo se puede registrar durante un periodo en juego.');
  }
  if (!Number.isSafeInteger(input.currentPeriodFoulCount) || input.currentPeriodFoulCount < 0) {
    return fail('El número actual de faltas no es válido.');
  }
  if (input.subjectSentOff) return fail('La persona seleccionada ya está expulsada.');
  if (input.disciplinaryAction === 'yellow' && input.currentYellowCards >= 1) {
    return fail('La siguiente amarilla debe registrarse como segunda amarilla.');
  }
  if (input.disciplinaryAction === 'secondYellow' && input.currentYellowCards !== 1) {
    return fail('La segunda amarilla requiere una amarilla previa.');
  }

  const subject = validateSubject(input);
  if (!subject.ok) return subject;
  const countsAsAccumulatedFoul = input.reason === 'protest';
  const normalizedName = normalizeOptionalName(input.staffName);

  return ok({
    match: { ...input.match, updatedAt: input.timestamp },
    event: {
      id: input.eventId,
      matchId: input.match.id,
      type: 'BENCH_DISCIPLINE',
      team: input.team,
      subjectKind: input.subjectKind,
      playerId: input.playerId,
      opponentPlayerNumber: input.opponentPlayerNumber,
      staffRole: input.staffRole,
      staffName: normalizedName,
      staffIdentityKey:
        input.subjectKind === 'staff' && input.staffRole
          ? createStaffIdentityKey(input.team, input.staffRole, normalizedName)
          : undefined,
      disciplinaryAction: input.disciplinaryAction,
      reason: input.reason,
      context: 'bench',
      countsAsAccumulatedFoul,
      createsDirectFreeKickWithoutWall: false,
      periodFoulNumber: input.currentPeriodFoulCount + (countsAsAccumulatedFoul ? 1 : 0),
      period: input.match.currentPeriod,
      gameClockMs: input.gameClockMs,
      timestamp: input.timestamp,
      sequence: input.sequence,
      undone: false,
    },
  });
}

export function createStaffIdentityKey(team: FoulTeam, role: StaffRole, name?: string): string {
  const normalizedName = normalizeOptionalName(name)?.toLocaleLowerCase('es-ES') ?? 'sin-nombre';
  return `${team}:${role}:${normalizedName}`;
}

function validateSubject(input: RegisterBenchDisciplineInput): DomainResult<true> {
  switch (input.subjectKind) {
    case 'player':
      if (input.team !== 'home' || !input.playerId) {
        return fail('Selecciona un suplente propio.');
      }
      if (!input.match.squadPlayerIds.includes(input.playerId)) {
        return fail('El jugador no está convocado.');
      }
      if (input.currentLineupPlayerIds.includes(input.playerId)) {
        return fail('La disciplina de banquillo solo admite jugadores que sean suplentes.');
      }
      return ok(true);
    case 'opponentPlayer':
      if (
        input.team !== 'away' ||
        !Number.isSafeInteger(input.opponentPlayerNumber) ||
        input.opponentPlayerNumber === undefined ||
        input.opponentPlayerNumber < 1 ||
        input.opponentPlayerNumber > 999
      ) {
        return fail('Indica un dorsal rival válido entre 1 y 999.');
      }
      return ok(true);
    case 'staff':
      if (!input.staffRole || !STAFF_ROLES.includes(input.staffRole)) {
        return fail('Selecciona el rol del miembro del staff.');
      }
      if ((input.staffName?.trim().length ?? 0) > 80) {
        return fail('El nombre del miembro del staff es demasiado largo.');
      }
      return ok(true);
  }
}

function normalizeOptionalName(name?: string): string | undefined {
  const normalized = name?.trim().replace(/\s+/g, ' ');
  return normalized || undefined;
}
