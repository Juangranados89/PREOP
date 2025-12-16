const XLSX = require('xlsx');

// Leer el archivo Excel
const workbook = XLSX.readFile('./public/BD-ORTIZ.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// Convertir a JSON
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

console.log('=== TODOS LOS HEADERS (fila 3) ===\n');
const headerRow = data[3];
headerRow.forEach((cell, idx) => {
  if (cell && cell.toString().trim()) {
    const cellStr = cell.toString().toUpperCase().trim();
    const keywords = ['SOTA', 'RTM', 'POLIZA', 'SEGURO', 'TECNO', 'REVISION', 'CERTIFICADO', 'VENCE'];
    const hasKeyword = keywords.some(k => cellStr.includes(k));
    if (hasKeyword) {
      console.log(`✓ Col ${idx}: ${cell}`);
    } else {
      console.log(`  Col ${idx}: ${cell}`);
    }
  }
});

console.log('\n=== EJEMPLO DE DATOS (fila 4) ===\n');
const dataRow = data[4];
console.log('PLACA:', dataRow[9]);
console.log('MARCA:', dataRow[11]);
console.log('FAMILIA:', dataRow[5]);
console.log('DESCRIPCION:', dataRow[6]);
