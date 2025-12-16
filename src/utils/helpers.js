export const getLocalDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getWeekNumber = (dateString) => {
  const d = new Date(dateString + 'T12:00:00'); // Mediodía para evitar problemas de TZ
  // Obtener el día de la semana (0=Domingo, 1=Lunes, ..., 6=Sábado)
  const dayOfWeek = d.getDay();
  // Calcular el lunes de esa semana
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Si es domingo, retroceder 6 días
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  
  // Usar la fecha del lunes como identificador único de semana (YYYY-MM-DD)
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, '0');
  const day = String(monday.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

export const arrayBufferToBase64 = (buffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

export const base64ToArrayBuffer = (base64) => {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
};

// ============================================================================
// ESPECIFICACIÓN DE INSERCIÓN (EXCEL) — PREOPERACIONAL SEMANAL
// Mapeado de celdas Excel para el formato preoperacional
// ============================================================================

// Mapeo de filas por ítem (N → fila r)
export const ITEM_ROW_MAP = {
  1: 14, 2: 15, 3: 17, 4: 18, 5: 19,
  6: 21, 7: 22, 8: 23, 9: 24, 10: 25,
  11: 27, 12: 28, 13: 29, 14: 30, 15: 31, 16: 32,
  17: 34, 18: 35, 19: 36, 20: 37,
  21: 39, 22: 40, 23: 41, 24: 42, 25: 43, 26: 44, 27: 45,
  28: 46, 29: 47, 30: 48, 31: 49, 32: 50, 33: 51, 34: 52, 35: 53,
  36: 55, 37: 56,
  38: 58, 39: 59, 40: 60, 41: 61,
  42: 63, 43: 64, 44: 65, 45: 66, 46: 67, 47: 68,
  48: 70, 49: 71, 50: 72, 51: 73, 52: 74, 53: 75, 54: 76,
  55: 78, 56: 79, 57: 80, 58: 81, 59: 82,
  60: 84, 61: 85, 62: 86,
  63: 88, 64: 89, 65: 90, 66: 91
};

// Diccionario de columnas por día (C = Cumple, NC = No Cumple, NA = No Aplica)
export const DAY_COLUMNS = {
  LUNES:     { C: 'E', NC: 'F', NA: 'G' },
  MARTES:    { C: 'H', NC: 'I', NA: 'J' },
  MIERCOLES: { C: 'K', NC: 'L', NA: 'M' },
  JUEVES:    { C: 'N', NC: 'O', NA: 'P' },
  VIERNES:   { C: 'Q', NC: 'R', NA: 'S' },
  SABADO:    { C: 'T', NC: 'U', NA: 'V' },
  DOMINGO:   { C: 'W', NC: 'X', NA: 'Y' }
};

// Celdas de cabecera para fechas de la semana (fila 11)
export const DATE_HEADER_CELLS = {
  LUNES: 'E11',
  MARTES: 'H11',
  MIERCOLES: 'K11',
  JUEVES: 'N11',
  VIERNES: 'Q11',
  SABADO: 'T11',
  DOMINGO: 'W11'
};

// Orden de días de la semana
export const DAYS_ORDER = [
  'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'
];

// Mapeo de índice de día JS (0=DOM) a índice de bloque (0=LUN)
export const JS_DAY_TO_BLOCK_MAP = { 1:0, 2:1, 3:2, 4:3, 5:4, 6:5, 0:6 };

// Valores de estado
export const STATUS_VALUES = {
  CUMPLE: 'C',
  NO_CUMPLE: 'NC',
  NO_APLICA: 'NA'
};

/**
 * Convierte letra de columna a número (A=1, B=2, etc.)
 */
export function colToNumber(col) {
  let result = 0;
  for (let i = 0; i < col.length; i++) {
    result = result * 26 + col.charCodeAt(i) - 64;
  }
  return result;
}

/**
 * Convierte número a letra de columna
 */
export function numberToCol(num) {
  let result = '';
  while (num > 0) {
    num--;
    result = String.fromCharCode(65 + (num % 26)) + result;
    num = Math.floor(num / 26);
  }
  return result;
}

/**
 * Obtiene las 3 celdas (C/NC/NA) para un ítem en un día específico
 */
export function getItemCells(itemNumber, day) {
  const row = ITEM_ROW_MAP[itemNumber];
  if (!row) {
    throw new Error(`Ítem ${itemNumber} no encontrado en el mapeado`);
  }
  
  const cols = DAY_COLUMNS[day.toUpperCase()];
  if (!cols) {
    throw new Error(`Día ${day} no válido`);
  }
  
  return {
    C: `${cols.C}${row}`,
    NC: `${cols.NC}${row}`,
    NA: `${cols.NA}${row}`
  };
}

/**
 * Genera las operaciones de Excel para marcar un ítem
 * Siguiendo la regla: vaciar las 3 celdas, luego escribir "X" en la elegida
 */
export function getMarkOperations(itemNumber, day, status) {
  const row = ITEM_ROW_MAP[itemNumber];
  const cols = DAY_COLUMNS[day.toUpperCase()];
  
  if (!row || !cols) return null;
  
  const cells = {
    C: `${cols.C}${row}`,
    NC: `${cols.NC}${row}`,
    NA: `${cols.NA}${row}`
  };
  
  const normalizedStatus = status.toUpperCase();
  const targetCell = cells[normalizedStatus];
  
  return {
    clear: [cells.C, cells.NC, cells.NA],
    set: { cell: targetCell, value: 'X' }
  };
}
