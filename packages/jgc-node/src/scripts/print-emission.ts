/**
 * @file src/scripts/print-emission.ts
 * @description CLI for the emission schedule table (npm run emission-table).
 *
 * Usage: node dist/scripts/print-emission.js [eras]
 *   eras — number of eras to print (default 10).
 */

import { printEmissionSchedule } from "../consensus/emission.js";

const requested = Number(process.argv[2] ?? 10);
const eras = Number.isInteger(requested) && requested > 0 ? requested : 10;

printEmissionSchedule(eras);
