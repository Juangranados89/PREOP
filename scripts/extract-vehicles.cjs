// Script para extraer datos del Excel BD-ORTIZ.xlsx
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const excelPath = path.join(__dirname, '../public/BD-ORTIZ.xlsx');
const workbook = XLSX.readFile(excelPath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Leer con header en fila 3 (índice 2)
const data = XLSX.utils.sheet_to_json(worksheet, { range: 2 });

console.log('Total registros:', data.length);
console.log('Primera columna:', Object.keys(data[0]));
console.log('Muestra de datos:', data.slice(0, 5));

// Generar el archivo vehicles.js
// Columnas: PLACA (10), MARCA (12), FAMILIA/TIPOLOGÍA (6), DESCRIPCIÓN (7)
const vehiclesData = data
  .map(row => ({
    PLACA: String(row['10'] || '').trim(),
    MARCA: String(row['12'] || '').trim(),
    FAMILIA: String(row['6'] || '').trim(),
    DESCRIPCION: String(row['7'] || '').trim()
  }))
  .filter(v => v.PLACA && v.PLACA !== 'N/A' && v.PLACA !== 'PLACA' && v.PLACA.length >= 5);

const fileContent = `// Base de datos de vehículos extraída de BD-ORTIZ.xlsx
// Total de vehículos: ${vehiclesData.length}
// Última actualización: ${new Date().toLocaleDateString('es-CO')}

export const VEHICLES_DB = ${JSON.stringify(vehiclesData, null, 2)};
`;

fs.writeFileSync(
  path.join(__dirname, '../src/data/vehicles.js'),
  fileContent,
  'utf-8'
);

console.log(`✅ Archivo vehicles.js generado con ${vehiclesData.length} vehículos`);
