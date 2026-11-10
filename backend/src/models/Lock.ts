import { Schema, model } from 'mongoose';

/** Small documents written inside transactions to serialise concurrent financial writes (e.g. one driver cycle). */
const lockSchema = new Schema({
  key: { type: String, required: true, unique: true },
  version: { type: Number, default: 0 },
});

export const Lock = model('Lock', lockSchema);
