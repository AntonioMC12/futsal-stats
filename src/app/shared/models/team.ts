export interface Team {
  id: string;
  name: string;
  shortName: string;
  logo?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TeamRef {
  id?: string;
  name: string;
  shortName: string;
}
