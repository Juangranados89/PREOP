import React, { useState, useEffect } from 'react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Importaciones Locales
import { CHECKLIST_STRUCTURE } from './data/checklist';
import { VEHICLES_DB } from './data/vehicles';
import { 
  getLocalDate, 
  getWeekNumber, 
  base64ToArrayBuffer, 
  arrayBufferToBase64,
  ITEM_ROW_MAP,
  DAY_COLUMNS,
  DATE_HEADER_CELLS,
  DAYS_ORDER,
  JS_DAY_TO_BLOCK_MAP
} from './utils/helpers';

// Constantes
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_CORTOS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export default function App() {
  // Estados principales
  const [view, setView] = useState('home');
  const [templateBuffer, setTemplateBuffer] = useState(null);
  const [weekData, setWeekData] = useState({});
  const [currentDate, setCurrentDate] = useState(getLocalDate());
  const [activeSection, setActiveSection] = useState(null);
  
  // Datos del formulario
  const [formData, setFormData] = useState({
    placa: '',
    conductor: '',
    kmInicio: '',
    ciudad: 'Barrancabermeja',
    tipoVehiculo: '',
    marca: '',
    modelo: '',
    respuestas: {}
  });

  // Cargar plantilla desde localStorage al iniciar
  useEffect(() => {
    const saved = localStorage.getItem('preop_template');
    if (saved) {
      try {
        const buffer = base64ToArrayBuffer(saved);
        setTemplateBuffer(buffer);
      } catch (e) {
        console.error('Error cargando plantilla:', e);
        localStorage.removeItem('preop_template');
      }
    }
    
    // Cargar datos guardados
    const savedData = localStorage.getItem('preop_weekData');
    if (savedData) {
      try {
        setWeekData(JSON.parse(savedData));
      } catch (e) {
        console.error('Error cargando datos:', e);
      }
    }
  }, []);

  // Autocompletado de vehículo
  useEffect(() => {
    if (formData.placa && formData.placa.length >= 5) {
      const vehiculo = VEHICLES_DB.find(v => 
        v.PLACA.replace(/\s/g, '').toUpperCase() === formData.placa.replace(/\s/g, '').toUpperCase()
      );
      if (vehiculo) {
        setFormData(prev => ({
          ...prev,
          tipoVehiculo: vehiculo.FAMILIA || '',
          marca: vehiculo.MARCA || '',
          modelo: vehiculo.DESCRIPCION || ''
        }));
      }
    }
  }, [formData.placa]);

  // Cargar datos del día actual cuando cambia la fecha
  useEffect(() => {
    const dayKey = `${formData.placa}_${currentDate}`;
    const savedDay = weekData[dayKey];
    
    if (savedDay) {
      setFormData(prev => ({ ...prev, ...savedDay }));
    } else {
      setFormData(prev => ({
        ...prev,
        kmInicio: '',
        respuestas: {}
      }));
    }
  }, [currentDate, formData.placa]);

  // Manejar carga de plantilla Excel
  const handleTemplateUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buffer = ev.target.result;
      setTemplateBuffer(buffer);
      try {
        localStorage.setItem('preop_template', arrayBufferToBase64(buffer));
        alert('✅ Plantilla cargada correctamente');
      } catch (err) {
        alert('Plantilla cargada (solo esta sesión)');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Eliminar plantilla
  const clearTemplate = () => {
    localStorage.removeItem('preop_template');
    setTemplateBuffer(null);
  };

  // Manejar cambios en inputs
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value.toUpperCase() }));
  };

  // Manejar respuesta de checklist
  const handleResponse = (itemId, status) => {
    setFormData(prev => ({
      ...prev,
      respuestas: { ...prev.respuestas, [itemId]: status }
    }));
  };

  // Ir a un día específico de la semana
  const goToWeekDay = (targetDayIndex) => {
    const current = new Date(currentDate + 'T00:00:00');
    const currentDay = current.getDay();
    const diff = targetDayIndex - currentDay;
    current.setDate(current.getDate() + diff);
    setCurrentDate(current.toISOString().split('T')[0]);
  };

  // Guardar día actual
  const saveDay = () => {
    if (!formData.placa) {
      alert('Por favor ingrese la placa del vehículo');
      return;
    }

    const dayKey = `${formData.placa}_${currentDate}`;
    const weekId = getWeekNumber(currentDate);
    
    const dayData = {
      ...formData,
      fecha: currentDate,
      weekId,
      timestamp: new Date().toISOString()
    };

    const newWeekData = { ...weekData, [dayKey]: dayData };
    setWeekData(newWeekData);
    
    try {
      localStorage.setItem('preop_weekData', JSON.stringify(newWeekData));
      alert('✅ Día guardado correctamente');
    } catch (e) {
      alert('Error guardando datos');
    }
  };

  // Obtener días completados de la semana actual
  const getCompletedDays = () => {
    const weekId = getWeekNumber(currentDate);
    const completed = [];
    
    Object.values(weekData).forEach(day => {
      if (day.weekId === weekId && day.placa === formData.placa) {
        const date = new Date(day.fecha + 'T00:00:00');
        completed.push(date.getDay());
      }
    });
    
    return completed;
  };

  // Generar Excel con mapeado fijo
  const generateExcel = async (consolidado = false) => {
    if (!templateBuffer) {
      alert('Primero cargue la plantilla Excel');
      return;
    }

    if (!formData.placa) {
      alert('Ingrese la placa del vehículo');
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(templateBuffer);
      const worksheet = workbook.getWorksheet(1);

      // Obtener documentos de la semana
      const weekId = getWeekNumber(currentDate);
      const docs = consolidado 
        ? Object.values(weekData).filter(d => d.weekId === weekId && d.placa === formData.placa)
        : [weekData[`${formData.placa}_${currentDate}`] || formData];

      if (docs.length === 0 || !docs[0]) {
        alert('No hay datos para exportar');
        return;
      }

      // Función para llenar celdas por etiqueta
      const fillByLabel = (labels, value) => {
        if (!value) return;
        const searchLabels = Array.isArray(labels) ? labels : [labels];
        
        worksheet.eachRow((row) => {
          row.eachCell((cell, colNumber) => {
            if (!cell.value) return;
            const cellVal = String(cell.value).toUpperCase().trim();
            if (searchLabels.some(lbl => cellVal.includes(lbl))) {
              const target = row.getCell(colNumber + 1);
              target.value = String(value).toUpperCase();
              target.alignment = { vertical: 'middle', horizontal: 'center' };
            }
          });
        });
      };

      // Llenar datos de cabecera
      const lastDoc = docs[docs.length - 1];
      fillByLabel(['PLACA', 'PLACA:'], lastDoc.placa);
      fillByLabel(['CONDUCTOR', 'CONDUCTOR:'], lastDoc.conductor);
      fillByLabel(['KM', 'KILOMETRAJE'], lastDoc.kmInicio);
      fillByLabel(['CIUDAD', 'CIUDAD:'], lastDoc.ciudad);
      fillByLabel(['TIPO DE VEHICULO', 'TIPO VEHICULO', 'TIPO:'], lastDoc.tipoVehiculo);
      fillByLabel(['MARCA', 'MARCA:'], lastDoc.marca);
      fillByLabel(['MODELO', 'MODELO:'], lastDoc.modelo);

      // Llenar fechas en cabecera
      docs.forEach(dayDoc => {
        if (!dayDoc) return;
        const dateObj = new Date(dayDoc.fecha + 'T00:00:00');
        const jsDayIdx = dateObj.getDay();
        const blockIdx = JS_DAY_TO_BLOCK_MAP[jsDayIdx];
        
        if (blockIdx !== undefined) {
          const dayName = DAYS_ORDER[blockIdx];
          const headerCell = DATE_HEADER_CELLS[dayName];
          if (headerCell) {
            const cell = worksheet.getCell(headerCell);
            cell.value = `${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()}`;
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }
        }
      });

      // ========== INYECCIÓN DE RESPUESTAS CON MAPEADO FIJO ==========
      docs.forEach(dayDoc => {
        if (!dayDoc || !dayDoc.respuestas) return;
        
        const dateObj = new Date(dayDoc.fecha + 'T00:00:00');
        const jsDayIdx = dateObj.getDay();
        const blockIdx = JS_DAY_TO_BLOCK_MAP[jsDayIdx];
        
        if (blockIdx === undefined) return;
        
        const dayName = DAYS_ORDER[blockIdx];
        const dayCols = DAY_COLUMNS[dayName];
        
        if (!dayCols) return;

        Object.entries(dayDoc.respuestas).forEach(([itemId, status]) => {
          const row = ITEM_ROW_MAP[itemId];
          if (!row) return;
          
          // Determinar columna según status
          let targetCol;
          if (status === 'C') targetCol = dayCols.C;
          else if (status === 'NC') targetCol = dayCols.NC;
          else if (status === 'NA') targetCol = dayCols.NA;
          else return;

          // Limpiar las 3 celdas del día para este ítem
          worksheet.getCell(`${dayCols.C}${row}`).value = null;
          worksheet.getCell(`${dayCols.NC}${row}`).value = null;
          worksheet.getCell(`${dayCols.NA}${row}`).value = null;

          // Escribir "X" en la celda correspondiente
          const cell = worksheet.getCell(`${targetCol}${row}`);
          cell.value = 'X';
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });
      });

      // Generar y descargar
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = consolidado 
        ? `Preoperacional_${formData.placa}_${weekId}_CONSOLIDADO.xlsx`
        : `Preoperacional_${formData.placa}_${currentDate}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Error generando Excel:', error);
      alert('Error generando el archivo Excel');
    }
  };

  // Generar PDF
  const generatePDF = () => {
    const weekId = getWeekNumber(currentDate);
    const docs = Object.values(weekData).filter(d => d.weekId === weekId && d.placa === formData.placa);
    
    if (docs.length === 0) {
      alert('No hay datos para exportar');
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const lastDoc = docs[docs.length - 1];

    doc.setFontSize(14);
    doc.text("INSPECCIÓN PREOPERACIONAL SEMANAL", 148, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`PLACA: ${lastDoc.placa} | CONDUCTOR: ${lastDoc.conductor} | SEMANA: ${weekId}`, 14, 25);

    const headers = [
      [{ content: 'ÍTEM', rowSpan: 2 }, 
       { content: 'LUN', colSpan: 3 }, { content: 'MAR', colSpan: 3 }, 
       { content: 'MIÉ', colSpan: 3 }, { content: 'JUE', colSpan: 3 }, 
       { content: 'VIE', colSpan: 3 }, { content: 'SÁB', colSpan: 3 }, 
       { content: 'DOM', colSpan: 3 }],
      ['C', 'NC', 'NA', 'C', 'NC', 'NA', 'C', 'NC', 'NA', 'C', 'NC', 'NA', 
       'C', 'NC', 'NA', 'C', 'NC', 'NA', 'C', 'NC', 'NA']
    ];

    const body = [];
    CHECKLIST_STRUCTURE.forEach(section => {
      body.push([{ content: section.section, colSpan: 22, styles: { fillColor: [220, 220, 220], fontStyle: 'bold' } }]);
      section.items.forEach(item => {
        const row = Array(22).fill('');
        row[0] = item.label;
        
        docs.forEach(dayDoc => {
          const dateObj = new Date(dayDoc.fecha + 'T00:00:00');
          const blockIdx = JS_DAY_TO_BLOCK_MAP[dateObj.getDay()];
          if (blockIdx !== undefined) {
            const resp = dayDoc.respuestas?.[item.id];
            if (resp) {
              const baseIdx = 1 + (blockIdx * 3);
              if (resp === 'C') row[baseIdx] = 'X';
              if (resp === 'NC') row[baseIdx + 1] = 'X';
              if (resp === 'NA') row[baseIdx + 2] = 'X';
            }
          }
        });
        body.push(row);
      });
    });

    doc.autoTable({
      startY: 30,
      head: headers,
      body: body,
      theme: 'grid',
      styles: { fontSize: 5, cellPadding: 0.5 },
      headStyles: { fillColor: [200, 200, 200], textColor: 0 },
      columnStyles: { 0: { cellWidth: 45 } }
    });

    doc.save(`Preoperacional_${lastDoc.placa}_${weekId}.pdf`);
  };

  const completedDays = getCompletedDays();
  const currentDayOfWeek = new Date(currentDate + 'T00:00:00').getDay();

  // ==================== VISTAS ====================

  // Vista HOME
  if (view === 'home') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', padding: '20px' }}>
        <div style={{ maxWidth: '400px', margin: '0 auto' }}>
          
          {/* Header */}
          <div style={{ 
            backgroundColor: '#1e40af', 
            color: 'white', 
            padding: '20px', 
            borderRadius: '12px',
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>🚛 PREOPERACIONAL</h1>
            <p style={{ margin: '8px 0 0', opacity: 0.9 }}>Grupo Ortiz - Inspección Vehicular</p>
          </div>

          {/* Plantilla Excel */}
          <div style={{ 
            backgroundColor: 'white', 
            padding: '20px', 
            borderRadius: '12px',
            marginBottom: '15px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 15px', fontSize: '14px', color: '#64748b' }}>📄 PLANTILLA EXCEL</h3>
            
            {templateBuffer ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ 
                  flex: 1, 
                  padding: '10px', 
                  backgroundColor: '#dcfce7', 
                  borderRadius: '8px',
                  color: '#166534',
                  fontWeight: 'bold'
                }}>
                  ✅ Plantilla cargada
                </span>
                <button 
                  onClick={clearTemplate}
                  style={{ 
                    padding: '10px 15px', 
                    backgroundColor: '#fee2e2', 
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    color: '#dc2626'
                  }}
                >
                  🗑️
                </button>
              </div>
            ) : (
              <label style={{ 
                display: 'block',
                padding: '20px',
                border: '2px dashed #cbd5e1',
                borderRadius: '8px',
                textAlign: 'center',
                cursor: 'pointer',
                backgroundColor: '#f8fafc'
              }}>
                <input type="file" accept=".xlsx" onChange={handleTemplateUpload} style={{ display: 'none' }} />
                <span style={{ color: '#64748b' }}>📤 Clic para cargar plantilla .xlsx</span>
              </label>
            )}
          </div>

          {/* Botón Iniciar */}
          <button 
            onClick={() => setView('form')}
            style={{ 
              width: '100%',
              padding: '18px',
              backgroundColor: '#1e40af',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '18px',
              fontWeight: 'bold',
              cursor: 'pointer',
              marginBottom: '15px'
            }}
          >
            ▶️ INICIAR INSPECCIÓN
          </button>

          {/* Consulta Rápida */}
          <div style={{ 
            backgroundColor: 'white', 
            padding: '20px', 
            borderRadius: '12px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 15px', fontSize: '14px', color: '#64748b' }}>🔍 CONSULTA RÁPIDA</h3>
            <input 
              type="text"
              placeholder="PLACA DEL VEHÍCULO"
              value={formData.placa}
              onChange={(e) => setFormData(prev => ({ ...prev, placa: e.target.value.toUpperCase() }))}
              style={{ 
                width: '100%',
                padding: '12px',
                border: '2px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '16px',
                textAlign: 'center',
                fontWeight: 'bold',
                marginBottom: '10px',
                boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => generateExcel(true)}
                disabled={!templateBuffer || !formData.placa}
                style={{ 
                  flex: 1,
                  padding: '12px',
                  backgroundColor: templateBuffer && formData.placa ? '#059669' : '#cbd5e1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: templateBuffer && formData.placa ? 'pointer' : 'not-allowed',
                  fontWeight: 'bold'
                }}
              >
                📥 Excel
              </button>
              <button 
                onClick={generatePDF}
                disabled={!formData.placa}
                style={{ 
                  flex: 1,
                  padding: '12px',
                  backgroundColor: formData.placa ? '#dc2626' : '#cbd5e1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: formData.placa ? 'pointer' : 'not-allowed',
                  fontWeight: 'bold'
                }}
              >
                📄 PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Calcular progreso semanal
  const totalItemsPerDay = CHECKLIST_STRUCTURE.reduce((acc, s) => acc + s.items.length, 0);
  const weeklyProgress = Math.round((completedDays.length / 7) * 100);

  // Vista FORMULARIO
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      
      {/* Header fijo mejorado */}
      <div style={{ 
        position: 'sticky',
        top: 0,
        backgroundColor: '#ffffff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        zIndex: 100
      }}>
        {/* Barra superior */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '12px 16px',
          borderBottom: '1px solid #f1f5f9'
        }}>
          <button 
            onClick={() => setView('home')}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: '#1e40af',
              padding: '8px 0',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            ← Inicio
          </button>
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            backgroundColor: '#f1f5f9',
            padding: '6px 12px',
            borderRadius: '8px'
          }}>
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
              📅 Semana {getWeekNumber(currentDate)}
            </span>
            <input 
              type="date" 
              value={currentDate}
              onChange={(e) => setCurrentDate(e.target.value)}
              style={{
                border: '1px solid #e2e8f0',
                fontSize: '13px',
                fontWeight: '600',
                color: '#1e293b',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '6px',
                backgroundColor: '#ffffff'
              }}
            />
          </div>
        </div>
        
        {/* Selector de días mejorado con nombres */}
        <div style={{ padding: '12px 16px' }}>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '6px'
          }}>
            {[
              { idx: 1, short: 'LUN', name: 'Lunes' },
              { idx: 2, short: 'MAR', name: 'Martes' },
              { idx: 3, short: 'MIÉ', name: 'Miércoles' },
              { idx: 4, short: 'JUE', name: 'Jueves' },
              { idx: 5, short: 'VIE', name: 'Viernes' },
              { idx: 6, short: 'SÁB', name: 'Sábado' },
              { idx: 0, short: 'DOM', name: 'Domingo' }
            ].map(day => {
              const isSelected = currentDayOfWeek === day.idx;
              const isCompleted = completedDays.includes(day.idx);
              
              // Calcular la fecha de este día
              const current = new Date(currentDate + 'T00:00:00');
              const diff = day.idx - current.getDay();
              const dayDate = new Date(current);
              dayDate.setDate(current.getDate() + diff);
              
              return (
                <button
                  key={day.idx}
                  onClick={() => goToWeekDay(day.idx)}
                  style={{
                    padding: '8px 4px',
                    border: isSelected ? '2px solid #1e40af' : isCompleted ? '2px solid #10b981' : '1px solid #e2e8f0',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? '#1e40af' : isCompleted ? '#ecfdf5' : '#ffffff',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px'
                  }}
                >
                  <span style={{ 
                    fontSize: '10px', 
                    fontWeight: '600',
                    color: isSelected ? '#ffffff' : isCompleted ? '#059669' : '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    {day.short}
                  </span>
                  <span style={{ 
                    fontSize: '16px', 
                    fontWeight: '700',
                    color: isSelected ? '#ffffff' : isCompleted ? '#047857' : '#1e293b'
                  }}>
                    {dayDate.getDate()}
                  </span>
                  {isCompleted && (
                    <span style={{ 
                      fontSize: '12px',
                      color: isSelected ? '#ffffff' : '#10b981'
                    }}>
                      ✓
                    </span>
                  )}
                  {!isCompleted && !isSelected && (
                    <span style={{ fontSize: '12px', color: 'transparent' }}>•</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Barra de progreso semanal */}
        <div style={{ 
          padding: '0 16px 12px',
          borderBottom: '1px solid #e2e8f0'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '6px'
          }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>
              📊 Progreso semanal
            </span>
            <span style={{ 
              fontSize: '12px', 
              fontWeight: '700', 
              color: weeklyProgress === 100 ? '#059669' : '#1e40af'
            }}>
              {completedDays.length}/7 días ({weeklyProgress}%)
            </span>
          </div>
          <div style={{ 
            height: '8px', 
            backgroundColor: '#e2e8f0', 
            borderRadius: '4px', 
            overflow: 'hidden'
          }}>
            <div style={{ 
              height: '100%', 
              background: weeklyProgress === 100 
                ? 'linear-gradient(90deg, #10b981, #059669)' 
                : 'linear-gradient(90deg, #3b82f6, #1e40af)',
              width: `${weeklyProgress}%`,
              borderRadius: '4px',
              transition: 'width 0.4s ease'
            }}></div>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div style={{ padding: '16px', maxWidth: '600px', margin: '0 auto' }}>
        
        {/* Día actual destacado */}
        <div style={{ 
          textAlign: 'center', 
          marginBottom: '16px',
          padding: '12px',
          backgroundColor: '#f0f9ff',
          borderRadius: '10px',
          border: '1px solid #bae6fd'
        }}>
          <span style={{ fontSize: '14px', color: '#0369a1', fontWeight: '600' }}>
            📝 Registrando: {DIAS_SEMANA[currentDayOfWeek]} {new Date(currentDate + 'T00:00:00').getDate()}/{new Date(currentDate + 'T00:00:00').getMonth() + 1}/{new Date(currentDate + 'T00:00:00').getFullYear()}
          </span>
        </div>
        
        {/* Datos del vehículo */}
        <div style={{ 
          backgroundColor: '#ffffff', 
          padding: '16px', 
          borderRadius: '12px',
          marginBottom: '16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase' }}>Placa del Vehículo</label>
            <input 
              name="placa"
              placeholder="Ej: ABC123"
              value={formData.placa}
              onChange={handleInputChange}
              style={{ 
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontWeight: '700',
                fontSize: '18px',
                textAlign: 'center',
                letterSpacing: '2px',
                boxSizing: 'border-box',
                backgroundColor: '#ffffff'
              }}
            />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase' }}>Kilometraje</label>
              <input 
                name="kmInicio"
                type="number"
                placeholder="0"
                value={formData.kmInicio}
                onChange={handleInputChange}
                style={{ 
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  boxSizing: 'border-box',
                  backgroundColor: '#ffffff'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase' }}>Ciudad</label>
              <input 
                name="ciudad"
                value={formData.ciudad}
                onChange={handleInputChange}
                style={{ 
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  boxSizing: 'border-box',
                  backgroundColor: '#ffffff'
                }}
              />
            </div>
          </div>
          
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase' }}>Conductor</label>
            <input 
              name="conductor"
              placeholder="Nombre completo"
              value={formData.conductor}
              onChange={handleInputChange}
              style={{ 
                width: '100%',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                boxSizing: 'border-box',
                backgroundColor: '#ffffff'
              }}
            />
          </div>
          
          {formData.marca && (
            <div style={{ 
              marginTop: '12px', 
              padding: '10px 12px', 
              backgroundColor: '#ffffff',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#374151',
              border: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '16px' }}>🚗</span>
              <span><strong>{formData.marca}</strong> {formData.modelo} • {formData.tipoVehiculo}</span>
            </div>
          )}
        </div>

        {/* Barra de progreso del día */}
        <div style={{ 
          marginBottom: '16px',
          padding: '14px 16px',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
              ✏️ Progreso del día
            </span>
            <span style={{ 
              fontSize: '13px', 
              fontWeight: '700', 
              color: Object.keys(formData.respuestas).length === CHECKLIST_STRUCTURE.reduce((acc, s) => acc + s.items.length, 0) ? '#059669' : '#1e40af'
            }}>
              {Object.keys(formData.respuestas).length} / {CHECKLIST_STRUCTURE.reduce((acc, s) => acc + s.items.length, 0)} ítems
            </span>
          </div>
          <div style={{ height: '10px', backgroundColor: '#e2e8f0', borderRadius: '5px', overflow: 'hidden' }}>
            <div style={{ 
              height: '100%', 
              background: Object.keys(formData.respuestas).length === CHECKLIST_STRUCTURE.reduce((acc, s) => acc + s.items.length, 0)
                ? 'linear-gradient(90deg, #10b981, #059669)'
                : 'linear-gradient(90deg, #60a5fa, #3b82f6)',
              width: `${(Object.keys(formData.respuestas).length / CHECKLIST_STRUCTURE.reduce((acc, s) => acc + s.items.length, 0)) * 100}%`,
              borderRadius: '5px',
              transition: 'width 0.3s ease'
            }}></div>
          </div>
        </div>

        {/* Checklist por secciones - diseño más limpio */}
        {CHECKLIST_STRUCTURE.map((section, sectionIdx) => (
          <div 
            key={sectionIdx}
            style={{ 
              backgroundColor: '#ffffff', 
              borderRadius: '8px',
              marginBottom: '8px',
              overflow: 'hidden',
              border: '1px solid #e5e7eb'
            }}
          >
            <button
              onClick={() => setActiveSection(activeSection === sectionIdx ? null : sectionIdx)}
              style={{
                width: '100%',
                padding: '14px 16px',
                backgroundColor: activeSection === sectionIdx ? '#f9fafb' : '#ffffff',
                border: 'none',
                textAlign: 'left',
                fontWeight: '600',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: '#111827'
              }}
            >
              <span>{section.section}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ 
                  backgroundColor: section.items.filter(i => formData.respuestas[i.id]).length === section.items.length ? '#dcfce7' : '#f3f4f6',
                  color: section.items.filter(i => formData.respuestas[i.id]).length === section.items.length ? '#166534' : '#6b7280',
                  padding: '2px 8px', 
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: '600'
                }}>
                  {section.items.filter(i => formData.respuestas[i.id]).length}/{section.items.length}
                </span>
                <span style={{ color: '#9ca3af', fontSize: '16px' }}>
                  {activeSection === sectionIdx ? '−' : '+'}
                </span>
              </div>
            </button>
            
            {activeSection === sectionIdx && (
              <div style={{ borderTop: '1px solid #e5e7eb' }}>
                {section.items.map((item, itemIdx) => (
                  <div 
                    key={item.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      borderBottom: itemIdx < section.items.length - 1 ? '1px solid #f3f4f6' : 'none',
                      backgroundColor: formData.respuestas[item.id] ? '#fafafa' : '#ffffff'
                    }}
                  >
                    <span style={{ fontSize: '13px', color: '#374151', flex: 1, paddingRight: '12px' }}>
                      {item.label}
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {['C', 'NC', 'NA'].map(status => {
                        const isSelected = formData.respuestas[item.id] === status;
                        let bgColor = '#f3f4f6';
                        let textColor = '#6b7280';
                        
                        if (isSelected) {
                          if (status === 'C') { bgColor = '#166534'; textColor = '#ffffff'; }
                          else if (status === 'NC') { bgColor = '#dc2626'; textColor = '#ffffff'; }
                          else { bgColor = '#4b5563'; textColor = '#ffffff'; }
                        }
                        
                        return (
                          <button
                            key={status}
                            onClick={() => handleResponse(item.id, status)}
                            style={{
                              padding: '6px 14px',
                              border: 'none',
                              borderRadius: '4px',
                              fontWeight: '600',
                              fontSize: '11px',
                              cursor: 'pointer',
                              backgroundColor: bgColor,
                              color: textColor,
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {status}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Botones de acción mejorados */}
        <div style={{ 
          position: 'sticky',
          bottom: 0,
          backgroundColor: '#ffffff',
          padding: '16px',
          marginTop: '24px',
          borderTop: '1px solid #e2e8f0',
          borderRadius: '16px 16px 0 0',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.08)'
        }}>
          <button
            onClick={saveDay}
            style={{
              width: '100%',
              padding: '16px',
              background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '700',
              cursor: 'pointer',
              marginBottom: '12px',
              boxShadow: '0 4px 12px rgba(30, 64, 175, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            💾 Guardar {DIAS_SEMANA[currentDayOfWeek]}
          </button>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => generateExcel(false)}
              disabled={!templateBuffer}
              style={{
                flex: 1,
                padding: '14px 12px',
                backgroundColor: templateBuffer ? '#f0fdf4' : '#f1f5f9',
                color: templateBuffer ? '#166534' : '#94a3b8',
                border: templateBuffer ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                borderRadius: '10px',
                fontWeight: '600',
                fontSize: '12px',
                cursor: templateBuffer ? 'pointer' : 'not-allowed',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span style={{ fontSize: '18px' }}>📗</span>
              Excel Día
            </button>
            <button
              onClick={() => generateExcel(true)}
              disabled={!templateBuffer}
              style={{
                flex: 1,
                padding: '14px 12px',
                backgroundColor: templateBuffer ? '#eff6ff' : '#f1f5f9',
                color: templateBuffer ? '#1e40af' : '#94a3b8',
                border: templateBuffer ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                borderRadius: '10px',
                fontWeight: '600',
                fontSize: '12px',
                cursor: templateBuffer ? 'pointer' : 'not-allowed',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span style={{ fontSize: '18px' }}>📊</span>
              Excel Semana
            </button>
            <button
              onClick={generatePDF}
              style={{
                flex: 1,
                padding: '14px 12px',
                backgroundColor: '#fef2f2',
                color: '#dc2626',
                border: '1px solid #fecaca',
                borderRadius: '10px',
                fontWeight: '600',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span style={{ fontSize: '18px' }}>📄</span>
              PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
