import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { Team } from '../../../shared/models/team';
import { LocalSyncMetadata } from './sync-metadata';

export type LocalTeamRecord = Team & LocalSyncMetadata;
export type LocalPlayerRecord = Player & LocalSyncMetadata;
export type LocalMatchRecord = Match & LocalSyncMetadata;
export type LocalMatchEventRecord = MatchEvent & LocalSyncMetadata;
