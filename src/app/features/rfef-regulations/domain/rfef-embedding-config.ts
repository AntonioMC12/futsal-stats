export const RFEF_EMBEDDING_MODEL = {
  id: 'Xenova/multilingual-e5-small',
  revision: '761b726dd34fb83930e26aab4e9ac3899aa1fa78',
  dtype: 'int8',
  dimension: 384,
} as const;

export const RFEF_HYBRID_WEIGHTS = {
  semantic: 0.62,
  textual: 0.38,
  exactTextBoost: 0.15,
  minimumSemanticScore: 0.78,
  minimumSemanticOnlyScore: 0.82,
} as const;
