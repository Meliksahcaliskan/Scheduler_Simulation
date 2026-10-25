// Input validation (PLAN.md §4). Returns human-readable errors; [] means valid.
import { MAX_PROCESSES, MAX_ARRIVAL, MAX_BURST, MAX_QUANTUM, MAX_ID_LENGTH } from './limits.js';

const WHOLE_NUMBER = /^\d+$/;
const VALID_ALGORITHMS = ['FCFS', 'SJF', 'SRTF', 'RR'];

function asText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function wholeNumberError(raw, label, min, max) {
  const text = asText(raw);
  const shown = raw === null || raw === undefined ? '' : String(raw);
  if (!WHOLE_NUMBER.test(text) || Number(text) < min) {
    return `${label} must be a whole number ≥ ${min} (got "${shown}").`;
  }
  if (Number(text) > max) return `${label} must be at most ${max} (got "${text}").`;
  return null;
}

/** rows: [{ id, arrival, burst }] with raw (string or number) values from the editor. */
export function validateInput(rows, algorithm, quantum) {
  const errors = [];
  if (!VALID_ALGORITHMS.includes(algorithm)) errors.push(`Unknown algorithm "${algorithm}".`);
  if (rows.length === 0) errors.push('Add at least one process.');
  if (rows.length > MAX_PROCESSES) {
    errors.push(`Too many processes: ${rows.length} (at most ${MAX_PROCESSES}).`);
  }

  const seen = new Map(); // lower-cased ID → { id, row }
  rows.forEach((r, i) => {
    const row = i + 1;
    const id = asText(r.id);
    if (id === '') {
      errors.push(`Row ${row}: Process ID is empty.`);
    } else if ([...id].length > MAX_ID_LENGTH) {
      errors.push(`Row ${row}: Process ID "${id}" is longer than ${MAX_ID_LENGTH} characters.`);
    } else {
      const first = seen.get(id.toLowerCase());
      if (first) {
        const note = first.id === id ? '' : ' (IDs are case-insensitive)';
        errors.push(`Row ${row}: ID "${id}" duplicates "${first.id}" in row ${first.row}${note}.`);
      } else {
        seen.set(id.toLowerCase(), { id, row });
      }
    }
    const arrivalError = wholeNumberError(r.arrival, 'Arrival time', 0, MAX_ARRIVAL);
    if (arrivalError) errors.push(`Row ${row}: ${arrivalError}`);
    const burstError = wholeNumberError(r.burst, 'CPU burst', 1, MAX_BURST);
    if (burstError) errors.push(`Row ${row}: ${burstError}`);
  });

  if (algorithm === 'RR') {
    const quantumError = wholeNumberError(quantum, 'Time quantum', 1, MAX_QUANTUM);
    if (quantumError) errors.push(quantumError);
  }
  return errors;
}

/** Converts validated rows into engine input. Call only when validateInput returned []. */
export function toProcesses(rows) {
  return rows.map((r) => ({ id: asText(r.id), arrival: Number(asText(r.arrival)), burst: Number(asText(r.burst)) }));
}
