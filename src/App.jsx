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
  
  // Estados para modal de confirmación
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    onCancel: null,
    confirmText: 'Sí',
    cancelText: 'No'
  });
  
  // Datos del formulario
  const [formData, setFormData] = useState({
    placa: '',
    conductor: '',
    kmInicio: '',
    ciudad: 'Barrancabermeja',
    tipoVehiculo: '',
    marca: '',
    modelo: '',
    combustible: 'GASOLINA', // GASOLINA, DIESEL, GAS
    licenciaCategoria: [], // B1, B2, B3, C1, C2, C3
    licenciaVencimiento: '',
    sota: '',
    rtm: '',
    poliza: '',
    respuestas: {}
  });
  
  // Estados para autocompletado
  const [placaSuggestions, setPlacaSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Estados para firmas digitales
  const [showFirmaModal, setShowFirmaModal] = useState(false);
  const [tipoFirma, setTipoFirma] = useState(''); // 'conductor' o 'sst'
  const [firmas, setFirmas] = useState({
    conductor: null, // { nombre, cc, cargo, fecha, firma }
    sst: null        // { nombre, cc, cargo, fecha, firma }
  });
  const [firmaFormData, setFirmaFormData] = useState({
    nombre: '',
    cc: '',
    cargo: ''
  });
  
  // Función para mostrar modal de confirmación
  const showConfirmModal = (title, message, onConfirm, onCancel = null) => {
    return new Promise((resolve) => {
      setModalConfig({
        isOpen: true,
        title,
        message,
        onConfirm: () => {
          setModalConfig(prev => ({ ...prev, isOpen: false }));
          if (onConfirm) onConfirm();
          resolve(true);
        },
        onCancel: () => {
          setModalConfig(prev => ({ ...prev, isOpen: false }));
          if (onCancel) onCancel();
          resolve(false);
        },
        confirmText: 'Sí',
        cancelText: 'No'
      });
    });
  };

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

  // Autocompletado de vehículo - búsqueda inteligente
  useEffect(() => {
    if (formData.placa && formData.placa.length >= 2) {
      const searchTerm = formData.placa.replace(/\s/g, '').toUpperCase();
      const matches = VEHICLES_DB.filter(v => 
        v.PLACA.replace(/\s/g, '').toUpperCase().includes(searchTerm)
      ).slice(0, 10); // Máximo 10 sugerencias
      
      setPlacaSuggestions(matches);
      setShowSuggestions(matches.length > 0);
      
      // Si hay coincidencia exacta, autocompletar datos
      const exactMatch = VEHICLES_DB.find(v => 
        v.PLACA.replace(/\s/g, '').toUpperCase() === searchTerm
      );
      
      if (exactMatch) {
        setFormData(prev => ({
          ...prev,
          tipoVehiculo: exactMatch.FAMILIA || '',
          marca: exactMatch.MARCA || '',
          modelo: exactMatch.DESCRIPCION || ''
        }));
        setShowSuggestions(false);
      }
    } else {
      setPlacaSuggestions([]);
      setShowSuggestions(false);
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
    // No convertir a mayúsculas si es un radio/checkbox (ya viene en el formato correcto)
    const finalValue = e.target.type === 'radio' || e.target.type === 'checkbox' ? value : value.toUpperCase();
    setFormData(prev => ({ ...prev, [name]: finalValue }));
  };
  
  // Manejar checkboxes de categoría de licencia
  const handleLicenciaCategoriaChange = (e) => {
    const { value, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      licenciaCategoria: checked 
        ? [...prev.licenciaCategoria, value]
        : prev.licenciaCategoria.filter(c => c !== value)
    }));
  };
  
  // Función para abrir modal de firma
  const abrirModalFirma = () => {
    setModalConfig({
      isOpen: true,
      title: '✍️ Firmar Preoperacional',
      message: '¿Como desea firmar el documento?',
      confirmText: '👤 Como Conductor',
      cancelText: '🛡️ Como Responsable SST',
      onConfirm: () => {
        setModalConfig(prev => ({ ...prev, isOpen: false }));
        setTipoFirma('conductor');
        setFirmaFormData({ nombre: formData.conductor || '', cc: '', cargo: '' });
        setShowFirmaModal(true);
      },
      onCancel: () => {
        setModalConfig(prev => ({ ...prev, isOpen: false }));
        setTipoFirma('sst');
        setFirmaFormData({ nombre: '', cc: '', cargo: '' });
        setShowFirmaModal(true);
      }
    });
  };
  
  // Función para guardar firma
  const guardarFirma = () => {
    if (!firmaFormData.nombre || !firmaFormData.cc || !firmaFormData.cargo) {
      setModalConfig({
        isOpen: true,
        title: '⚠️ Campos incompletos',
        message: 'Por favor complete todos los campos para generar la firma digital.',
        confirmText: 'Entendido',
        cancelText: null,
        onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
        onCancel: null
      });
      return;
    }
    
    const fechaActual = new Date().toLocaleDateString('es-CO', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const firmaTexto = `${firmaFormData.nombre}\nCC: ${firmaFormData.cc}\n${firmaFormData.cargo}\n\n"Firmado digitalmente el ${fechaActual}"\n✓ Grupo Ortiz - Firma Electrónica`;
    
    setFirmas(prev => ({
      ...prev,
      [tipoFirma]: {
        ...firmaFormData,
        fecha: fechaActual,
        firma: firmaTexto
      }
    }));
    
    setShowFirmaModal(false);
    setFirmaFormData({ nombre: '', cc: '', cargo: '' });
    
    // Mostrar confirmación
    setTimeout(() => {
      setModalConfig({
        isOpen: true,
        title: '✅ Firma registrada',
        message: `La firma como ${tipoFirma === 'conductor' ? 'Conductor' : 'Responsable SST'} ha sido registrada correctamente.`,
        confirmText: 'Entendido',
        cancelText: null,
        onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
        onCancel: null
      });
    }, 300);
  };

  // Manejar respuesta de checklist
  const handleResponse = (itemId, status) => {
    setFormData(prev => ({
      ...prev,
      respuestas: { ...prev.respuestas, [itemId]: status }
    }));
  };

  // Ir a un día específico de la semana
  const goToWeekDay = async (targetDayIndex) => {
    // Obtener la fecha del lunes de la semana actual
    const current = new Date(currentDate + 'T00:00:00');
    const currentDay = current.getDay();
    
    // Calcular cuántos días desde el lunes (lunes = 0 días, martes = 1, ..., domingo = 6)
    const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
    const monday = new Date(current);
    monday.setDate(current.getDate() - daysFromMonday);
    
    // Calcular la fecha destino desde el lunes
    const targetDaysFromMonday = targetDayIndex === 0 ? 6 : targetDayIndex - 1;
    const targetDate = new Date(monday);
    targetDate.setDate(monday.getDate() + targetDaysFromMonday);
    
    const newDate = targetDate.toISOString().split('T')[0];
    
    // Verificar si el día anterior tiene datos guardados
    const previousDay = new Date(current);
    previousDay.setDate(previousDay.getDate() - 1);
    const previousDateStr = previousDay.toISOString().split('T')[0];
    const previousDayKey = `${formData.placa}_${previousDateStr}`;
    const previousData = weekData[previousDayKey];
    
    // Si hay datos del día anterior y el nuevo día no tiene datos, preguntar si desea replicar
    const newDayKey = `${formData.placa}_${newDate}`;
    const newDayData = weekData[newDayKey];
    
    if (previousData && !newDayData && formData.placa) {
      // Mostrar modal personalizado para replicar datos
      setModalConfig({
        isOpen: true,
        title: '🔄 Replicar datos del día anterior',
        message: `¿Desea copiar la información del día anterior?\n\nVehículo: ${previousData.placa}\nConductor: ${previousData.conductor}\nCiudad: ${previousData.ciudad}`,
        confirmText: 'Sí, replicar',
        cancelText: 'No',
        onConfirm: () => {
          setModalConfig(prev => ({ ...prev, isOpen: false }));
          
          // Copiar todos los datos del día anterior (incluyendo firmas)
          setFormData({
            ...previousData,
            fecha: newDate,
            respuestas: { ...previousData.respuestas },
            firmas: previousData.firmas ? { ...previousData.firmas } : undefined
          });
          
          // Copiar las firmas al estado de firmas también
          if (previousData.firmas) {
            setFirmas({ ...previousData.firmas });
          }
          
          // Preguntar si desea modificar después de un pequeño delay
          setTimeout(() => {
            setModalConfig({
              isOpen: true,
              title: '✏️ Modificar checklist',
              message: '¿Desea ajustar o modificar algún sistema del checklist?\n\nSÍ: Podrá editar las respuestas\nNO: Se guardarán las mismas del día anterior',
              confirmText: 'Sí, modificar',
              cancelText: 'No, mantener',
              onConfirm: () => {
                setModalConfig(prev => ({ ...prev, isOpen: false }));
                // No hacer nada, permitir edición
              },
              onCancel: () => {
                setModalConfig(prev => ({ ...prev, isOpen: false }));
                
                // Guardar automáticamente con los mismos datos
                const dayKey = `${previousData.placa}_${newDate}`;
                const weekId = getWeekNumber(newDate);
                const dataToSave = {
                  ...previousData,
                  fecha: newDate,
                  weekId,
                  respuestas: { ...previousData.respuestas },
                  firmas: previousData.firmas ? { ...previousData.firmas } : null
                };
                
                setWeekData(prev => {
                  const updated = { ...prev, [dayKey]: dataToSave };
                  localStorage.setItem('weekData', JSON.stringify(updated));
                  return updated;
                });
                
                // Mostrar confirmación con modal
                setTimeout(() => {
                  setModalConfig({
                    isOpen: true,
                    title: '✅ Guardado exitoso',
                    message: 'Los datos han sido replicados y guardados correctamente.',
                    confirmText: 'Entendido',
                    cancelText: null,
                    onConfirm: () => {
                      setModalConfig(prev => ({ ...prev, isOpen: false }));
                    },
                    onCancel: null
                  });
                }, 300);
              }
            });
          }, 300);
        },
        onCancel: () => {
          setModalConfig(prev => ({ ...prev, isOpen: false }));
        }
      });
    }
    
    setCurrentDate(newDate);
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
      firmas: firmas && (firmas.conductor || firmas.sst) ? { ...firmas } : null,
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

      // Configurar página para que quepa en 1 hoja vertical al imprimir/PDF
      worksheet.pageSetup = {
        paperSize: 9, // A4
        orientation: 'portrait', // Vertical
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1, // Forzar a 1 página de alto
        horizontalCentered: true,
        verticalCentered: true, // Centrar también verticalmente
        margins: {
          left: 0.15,
          right: 0.15,
          top: 0.15,
          bottom: 0.15,
          header: 0.1,
          footer: 0.1
        },
        printArea: 'A1:Y99', // Área de impresión ajustada al contenido real
        scale: 100 // Escala al 100%
      };

      // Aumentar altura de filas para aprovechar espacio (1.3x)
      for (let i = 1; i <= 99; i++) {
        const row = worksheet.getRow(i);
        if (row.height) {
          row.height = row.height * 1.3; // Aumentar 30%
        } else {
          row.height = 18; // Altura por defecto aumentada
        }
      }

      // Obtener documentos de la semana
      const weekId = getWeekNumber(currentDate);
      const docs = consolidado 
        ? Object.values(weekData).filter(d => d.weekId === weekId && d.placa === formData.placa)
        : [weekData[`${formData.placa}_${currentDate}`] || formData];

      if (docs.length === 0 || !docs[0]) {
        alert('No hay datos para exportar');
        return;
      }

      // ========== MAPEO DIRECTO DEL HEADER ==========
      const lastDoc = docs[docs.length - 1];
      
      // Fila 5: C5=TIPO DE VEHICULO, H5=PLACA, M5=MODELO, V5=KM FIN
      worksheet.getCell('C5').value = lastDoc.tipoVehiculo || '';
      worksheet.getCell('C5').alignment = { vertical: 'middle', horizontal: 'center' };
      
      worksheet.getCell('H5').value = lastDoc.placa || '';
      worksheet.getCell('H5').alignment = { vertical: 'middle', horizontal: 'center' };
      
      worksheet.getCell('M5').value = lastDoc.modelo || '';
      worksheet.getCell('M5').alignment = { vertical: 'middle', horizontal: 'center' };
      
      worksheet.getCell('V5').value = lastDoc.kmInicio || '';
      worksheet.getCell('V5').alignment = { vertical: 'middle', horizontal: 'center' };
      
      // Fila 6: C6=MARCA, H6=MES AÑO, N6/R6/V6=COMBUSTIBLE
      worksheet.getCell('C6').value = lastDoc.marca || '';
      worksheet.getCell('C6').alignment = { vertical: 'middle', horizontal: 'center' };
      
      // MES AÑO extraído de fecha (ej: "ENERO 2024")
      if (lastDoc.fecha) {
        const dateObj = new Date(lastDoc.fecha + 'T00:00:00');
        const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 
                       'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
        const mesAnio = `${meses[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
        worksheet.getCell('H6').value = mesAnio;
        worksheet.getCell('H6').alignment = { vertical: 'middle', horizontal: 'center' };
      }
      
      // Combustible checkboxes con "X"
      worksheet.getCell('N6').value = lastDoc.combustible === 'GASOLINA' ? 'X' : null;
      worksheet.getCell('N6').alignment = { vertical: 'middle', horizontal: 'center' };
      
      worksheet.getCell('R6').value = lastDoc.combustible === 'DIESEL' ? 'X' : null;
      worksheet.getCell('R6').alignment = { vertical: 'middle', horizontal: 'center' };
      
      worksheet.getCell('V6').value = lastDoc.combustible === 'GAS' ? 'X' : null;
      worksheet.getCell('V6').alignment = { vertical: 'middle', horizontal: 'center' };
      
      // Fila 8: C8=CONDUCTOR, H8=CIUDAD
      worksheet.getCell('C8').value = lastDoc.conductor || '';
      worksheet.getCell('C8').alignment = { vertical: 'middle', horizontal: 'center' };
      
      worksheet.getCell('H8').value = lastDoc.ciudad || '';
      worksheet.getCell('H8').alignment = { vertical: 'middle', horizontal: 'center' };
      
      // ========== MAPEO DE DOCUMENTACIÓN (Filas 15-18) ==========
      // Fila 15: LICENCIA DE CONDUCCIÓN - Categoría (columna amarilla) y Vencimiento
      if (lastDoc.licenciaCategoria && lastDoc.licenciaCategoria.length > 0) {
        const categorias = lastDoc.licenciaCategoria.join(', ');
        worksheet.getCell('C15').value = categorias; // Columna de CATEGORÍA
        worksheet.getCell('C15').alignment = { vertical: 'middle', horizontal: 'center' };
      }
      if (lastDoc.licenciaVencimiento) {
        const vencDate = new Date(lastDoc.licenciaVencimiento);
        worksheet.getCell('D15').value = `${vencDate.getDate()}/${vencDate.getMonth() + 1}/${vencDate.getFullYear()}`; // VENCE:
        worksheet.getCell('D15').alignment = { vertical: 'middle', horizontal: 'center' };
      }
      
      // Fila 16: SEGURO OBLIGATORIO (SOTA)
      if (lastDoc.sota) {
        const sotaDate = new Date(lastDoc.sota);
        worksheet.getCell('D16').value = `${sotaDate.getDate()}/${sotaDate.getMonth() + 1}/${sotaDate.getFullYear()}`;
        worksheet.getCell('D16').alignment = { vertical: 'middle', horizontal: 'center' };
      }
      
      // Fila 17: SEGURO TODO RIESGO (RTM)
      if (lastDoc.rtm) {
        const rtmDate = new Date(lastDoc.rtm);
        worksheet.getCell('D17').value = `${rtmDate.getDate()}/${rtmDate.getMonth() + 1}/${rtmDate.getFullYear()}`;
        worksheet.getCell('D17').alignment = { vertical: 'middle', horizontal: 'center' };
      }
      
      // Fila 18: CERTIFICADO DE GASES (Póliza)
      if (lastDoc.poliza) {
        const polizaDate = new Date(lastDoc.poliza);
        worksheet.getCell('D18').value = `${polizaDate.getDate()}/${polizaDate.getMonth() + 1}/${polizaDate.getFullYear()}`;
        worksheet.getCell('D18').alignment = { vertical: 'middle', horizontal: 'center' };
      }
      
      // ========== FIRMAS DIGITALES (Filas 98-99) ==========
      // Nota: Las filas tienen títulos en columna A/M, los datos van en las mismas celdas
      // pero preservando el formato de celdas combinadas
      
      // Firma del CONDUCTOR (Bloque izquierdo)
      if (lastDoc.firmas && lastDoc.firmas.conductor) {
        // Fila 98: NOMBRE del conductor
        // Leer el valor actual para ver si tiene un título
        const cell98 = worksheet.getCell('A98');
        const currentValue98 = cell98.value;
        
        // Si la celda tiene "NOMBRE" como título, agregar el nombre después
        if (currentValue98 && currentValue98.toString().includes('NOMBRE')) {
          cell98.value = lastDoc.firmas.conductor.nombre.toUpperCase();
        } else {
          cell98.value = lastDoc.firmas.conductor.nombre.toUpperCase();
        }
        cell98.alignment = { vertical: 'middle', horizontal: 'center' };
        cell98.font = { bold: true, size: 11 };
        
        // Fila 99-100: FIRMA del conductor (merged)
        const cell99 = worksheet.getCell('A99');
        const firmaTexto = `${lastDoc.firmas.conductor.nombre}\nCC: ${lastDoc.firmas.conductor.cc}\n${lastDoc.firmas.conductor.cargo}\nFirmado: ${lastDoc.firmas.conductor.fecha}`;
        cell99.value = firmaTexto;
        cell99.alignment = { 
          vertical: 'middle', 
          horizontal: 'center',
          wrapText: true 
        };
        cell99.font = { size: 8, italic: true };
      }
      
      // Firma del RESPONSABLE SST (Bloque derecho)
      if (lastDoc.firmas && lastDoc.firmas.sst) {
        // Fila 98: NOMBRE del responsable SST
        const cellM98 = worksheet.getCell('M98');
        cellM98.value = lastDoc.firmas.sst.nombre.toUpperCase();
        cellM98.alignment = { vertical: 'middle', horizontal: 'center' };
        cellM98.font = { bold: true, size: 11 };
        
        // Fila 99-100: FIRMA del responsable SST (merged)
        const cellM99 = worksheet.getCell('M99');
        const firmaTextoSST = `${lastDoc.firmas.sst.nombre}\nCC: ${lastDoc.firmas.sst.cc}\n${lastDoc.firmas.sst.cargo}\nFirmado: ${lastDoc.firmas.sst.fecha}`;
        cellM99.value = firmaTextoSST;
        worksheet.getCell('M99').alignment = { 
          vertical: 'middle', 
          horizontal: 'center',
          wrapText: true 
        };
        worksheet.getCell('M99').font = { size: 9, italic: true };
      }

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
  const generatePDF = async () => {
    if (!templateBuffer) {
      setModalConfig({
        isOpen: true,
        title: '⚠️ Plantilla requerida',
        message: 'Primero debe cargar la plantilla Excel para poder generar el PDF.',
        confirmText: 'Entendido',
        cancelText: null,
        onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
        onCancel: null
      });
      return;
    }

    if (!formData.placa) {
      setModalConfig({
        isOpen: true,
        title: '⚠️ Placa requerida',
        message: 'Ingrese la placa del vehículo para generar el PDF.',
        confirmText: 'Entendido',
        cancelText: null,
        onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
        onCancel: null
      });
      return;
    }

    try {
      // Mostrar modal de carga
      setModalConfig({
        isOpen: true,
        title: '⏳ Generando PDF...',
        message: 'Por favor espere mientras se genera el PDF con el formato corporativo.',
        confirmText: null,
        cancelText: null,
        onConfirm: null,
        onCancel: null
      });

      // Primero generar el Excel en memoria
      const weekId = getWeekNumber(currentDate);
      const docs = Object.values(weekData).filter(d => d.weekId === weekId && d.placa === formData.placa);

      if (docs.length === 0) {
        setModalConfig({
          isOpen: true,
          title: '⚠️ Sin datos',
          message: 'No hay datos guardados para exportar.',
          confirmText: 'Entendido',
          cancelText: null,
          onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
          onCancel: null
        });
        return;
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(templateBuffer);
      const worksheet = workbook.getWorksheet(1);

      // Configurar página para que quepa en 1 hoja vertical al imprimir/PDF
      worksheet.pageSetup = {
        paperSize: 9, // A4
        orientation: 'portrait', // Vertical
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1, // Forzar a 1 página de alto
        horizontalCentered: true,
        verticalCentered: true, // Centrar también verticalmente
        margins: {
          left: 0.15,
          right: 0.15,
          top: 0.15,
          bottom: 0.15,
          header: 0.1,
          footer: 0.1
        },
        printArea: 'A1:Y99', // Área de impresión ajustada al contenido real
        scale: 100 // Escala al 100%
      };

      const lastDoc = docs[docs.length - 1];

      // Aumentar altura de filas para aprovechar espacio (1.5x)
      for (let i = 1; i <= 99; i++) {
        const row = worksheet.getRow(i);
        if (row.height) {
          row.height = row.height * 1.3; // Aumentar 30%
        } else {
          row.height = 18; // Altura por defecto aumentada
        }
      }

      // Mapear datos del encabezado
      worksheet.getCell('C5').value = lastDoc.tipoVehiculo || '';
      worksheet.getCell('H5').value = lastDoc.placa || '';
      worksheet.getCell('M5').value = lastDoc.modelo || '';
      worksheet.getCell('V5').value = lastDoc.kmInicio || '';
      worksheet.getCell('C6').value = lastDoc.marca || '';
      worksheet.getCell('H6').value = lastDoc.mesAño || '';
      
      // Combustible en N6, R6 y V6
      if (lastDoc.combustible === 'GASOLINA') {
        worksheet.getCell('N6').value = 'X';
      } else if (lastDoc.combustible === 'DIESEL') {
        worksheet.getCell('R6').value = 'X';
      } else if (lastDoc.combustible === 'GAS') {
        worksheet.getCell('V6').value = 'X';
      }

      worksheet.getCell('C8').value = lastDoc.conductor || '';
      worksheet.getCell('H8').value = lastDoc.ciudad || '';

      // Mapear documentos (licencia, certificados)
      if (lastDoc.licenciaCategoria && lastDoc.licenciaCategoria.length > 0) {
        const licenciaTexto = `${lastDoc.licenciaCategoria.join(', ')}${lastDoc.licenciaVencimiento ? ' - Vence: ' + lastDoc.licenciaVencimiento : ''}`;
        worksheet.getCell('D15').value = licenciaTexto;
      }
      worksheet.getCell('D16').value = lastDoc.sota || '';
      worksheet.getCell('D17').value = lastDoc.rtm || '';
      worksheet.getCell('D18').value = lastDoc.poliza || '';

      // Mapear firmas en celdas combinadas
      if (lastDoc.firmas) {
        if (lastDoc.firmas.conductor) {
          const conductorText = `Nombre: ${lastDoc.firmas.conductor.nombre}\nCC: ${lastDoc.firmas.conductor.cc}\nCargo: ${lastDoc.firmas.conductor.cargo}\nFecha: ${lastDoc.firmas.conductor.fecha}`;
          worksheet.getCell('A98').value = conductorText;
          worksheet.getCell('A98').alignment = { wrapText: true, vertical: 'top' };
          
          if (lastDoc.firmas.conductor.firma) {
            worksheet.getCell('A99').value = lastDoc.firmas.conductor.firma;
            worksheet.getCell('A99').alignment = { wrapText: true, vertical: 'top' };
          }
        }

        if (lastDoc.firmas.sst) {
          const sstText = `Nombre: ${lastDoc.firmas.sst.nombre}\nCC: ${lastDoc.firmas.sst.cc}\nCargo: ${lastDoc.firmas.sst.cargo}\nFecha: ${lastDoc.firmas.sst.fecha}`;
          worksheet.getCell('M98').value = sstText;
          worksheet.getCell('M98').alignment = { wrapText: true, vertical: 'top' };
          
          if (lastDoc.firmas.sst.firma) {
            worksheet.getCell('M99').value = lastDoc.firmas.sst.firma;
            worksheet.getCell('M99').alignment = { wrapText: true, vertical: 'top' };
          }
        }
      }

      // Mapear fechas en encabezados
      docs.forEach(dayDoc => {
        const dateObj = new Date(dayDoc.fecha + 'T00:00:00');
        const dayOfWeek = dateObj.getDay();
        const blockIdx = JS_DAY_TO_BLOCK_MAP[dayOfWeek];
        if (blockIdx !== undefined) {
          const dayKey = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'][blockIdx];
          const dateCell = DATE_HEADER_CELLS[dayKey];
          if (dateCell) {
            worksheet.getCell(dateCell).value = dateObj.getDate();
          }
        }
      });

      // Mapear respuestas del checklist
      docs.forEach(dayDoc => {
        const dateObj = new Date(dayDoc.fecha + 'T00:00:00');
        const dayOfWeek = dateObj.getDay();
        const blockIdx = JS_DAY_TO_BLOCK_MAP[dayOfWeek];
        if (blockIdx !== undefined) {
          const dayKey = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'][blockIdx];
          const cols = DAY_COLUMNS[dayKey];
          if (cols && dayDoc.respuestas) {
            Object.keys(dayDoc.respuestas).forEach(itemId => {
              const itemNumber = parseInt(itemId);
              const rowNumber = ITEM_ROW_MAP[itemNumber];
              if (rowNumber) {
                const respuesta = dayDoc.respuestas[itemId];
                let targetCol;
                if (respuesta === 'C') targetCol = cols.C;
                else if (respuesta === 'NC') targetCol = cols.NC;
                else if (respuesta === 'NA') targetCol = cols.NA;
                if (targetCol) {
                  const cellRef = `${targetCol}${rowNumber}`;
                  const cell = worksheet.getCell(cellRef);
                  cell.value = 'X';
                  cell.alignment = { horizontal: 'center', vertical: 'middle' };
                }
              }
            });
          }
        }
      });

      // Convertir workbook a buffer
      const excelBuffer = await workbook.xlsx.writeBuffer();

      // Enviar al backend para conversión a PDF
      try {
        // Usar ruta relativa para aprovechar el proxy de Vite
        const apiUrl = '/api/convert-to-pdf';
        
        console.log('🔗 API URL:', apiUrl);
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          },
          body: excelBuffer
        });

        if (!response.ok) {
          throw new Error(`Error del servidor: ${response.statusText}`);
        }

        const pdfBlob = await response.blob();
        const pdfFileName = `Preoperacional_${lastDoc.placa}_${weekId}.pdf`;
        const url = window.URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = pdfFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Cerrar modal de carga
        setModalConfig({
          isOpen: false,
          title: '',
          message: '',
          onConfirm: null,
          onCancel: null
        });

        // Mostrar modal de compartir
        setTimeout(() => {
          setModalConfig({
            isOpen: true,
            title: '✅ PDF Generado',
            message: '¿Desea compartir el archivo descargado?',
            confirmText: '📧 Correo',
            cancelText: '💬 WhatsApp',
            onConfirm: () => {
              // Compartir por correo
              const subject = encodeURIComponent(`Preoperacional ${lastDoc.placa} - Semana ${weekId}`);
              const body = encodeURIComponent(`Adjunto el formato preoperacional del vehículo ${lastDoc.placa}.\n\nConductor: ${lastDoc.conductor}\nCiudad: ${lastDoc.ciudad}\nSemana: ${weekId}\n\nPor favor revise el archivo PDF adjunto.`);
              window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
              
              setModalConfig({
                isOpen: false,
                title: '',
                message: '',
                onConfirm: null,
                onCancel: null
              });
            },
            onCancel: () => {
              // Compartir por WhatsApp
              const text = encodeURIComponent(`📋 *Preoperacional ${lastDoc.placa}*\n\n👤 Conductor: ${lastDoc.conductor}\n📍 Ciudad: ${lastDoc.ciudad}\n📅 Semana: ${weekId}\n\n_El archivo PDF ha sido descargado en su dispositivo._`);
              window.open(`https://wa.me/?text=${text}`, '_blank');
              
              setModalConfig({
                isOpen: false,
                title: '',
                message: '',
                onConfirm: null,
                onCancel: null
              });
            },
            showCloseButton: true,
            onClose: () => {
              setModalConfig({
                isOpen: false,
                title: '',
                message: '',
                onConfirm: null,
                onCancel: null
              });
            }
          });
        }, 300);

        // Limpiar URL después de un tiempo
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
        }, 5000);
      } catch (error) {
        console.error('Error al generar PDF:', error);
        
        setModalConfig({
          isOpen: false,
          title: '',
          message: '',
          onConfirm: null,
          onCancel: null
        });

        setModalConfig({
          isOpen: true,
          title: '⚠️ Error al Generar PDF',
          message: `No se pudo generar el PDF. Error: ${error.message}. Intente nuevamente o descargue el Excel.`,
          confirmText: 'Aceptar',
          onConfirm: () => {
            setModalConfig({
              isOpen: false,
              title: '',
              message: '',
              onConfirm: null,
              onCancel: null
            });
          }
        });
      }
    } catch (error) {
      console.error('Error en generatePDF:', error);
      
      setModalConfig({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: null,
        onCancel: null
      });

      setModalConfig({
        isOpen: true,
        title: '⚠️ Error',
        message: `Error al generar el PDF: ${error.message}`,
        confirmText: 'Aceptar',
        onConfirm: () => {
          setModalConfig({
            isOpen: false,
            title: '',
            message: '',
            onConfirm: null,
            onCancel: null
          });
        }
      });
    }
  };

  const completedDays = getCompletedDays();
  const currentDayOfWeek = new Date(currentDate + 'T00:00:00').getDay();

  // ==================== VISTAS ====================

  // Vista HOME
  if (view === 'home') {
    return (
      <>
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
      
      {/* Modal de Confirmación Personalizado */}
      {modalConfig.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            maxWidth: '400px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            animation: 'slideIn 0.2s ease-out'
          }}>
            {/* Header del modal */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: '700',
                color: '#1f2937',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                {modalConfig.title}
              </h3>
            </div>
            
            {/* Cuerpo del modal */}
            <div style={{
              padding: '24px',
              fontSize: '14px',
              color: '#4b5563',
              lineHeight: '1.6',
              whiteSpace: 'pre-line'
            }}>
              {modalConfig.message}
            </div>
            
            {/* Footer con botones */}
            <div style={{
              padding: '16px 24px',
              backgroundColor: '#f9fafb',
              borderTop: '1px solid #e5e7eb',
              borderRadius: '0 0 16px 16px',
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              {modalConfig.onCancel && modalConfig.cancelText && (
                <button
                  onClick={modalConfig.onCancel}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#ffffff',
                    color: '#6b7280',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                >
                  {modalConfig.cancelText}
                </button>
              )}
              
              <button
                onClick={modalConfig.onConfirm}
                style={{
                  padding: '10px 24px',
                  backgroundColor: '#1e40af',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1e3a8a'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1e40af'}
              >
                {modalConfig.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    );
  }

  // Calcular progreso semanal
  const totalItemsPerDay = CHECKLIST_STRUCTURE.reduce((acc, s) => acc + s.items.length, 0);
  const weeklyProgress = Math.round((completedDays.length / 7) * 100);

  // Vista FORMULARIO
  return (
    <>
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
              
              // Calcular la fecha de este día basándonos en el lunes de la semana
              const current = new Date(currentDate + 'T00:00:00');
              const currentDay = current.getDay();
              // Calcular cuántos días desde el lunes
              const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
              const monday = new Date(current);
              monday.setDate(current.getDate() - daysFromMonday);
              // Calcular fecha del día destino desde el lunes
              const targetDaysFromMonday = day.idx === 0 ? 6 : day.idx - 1;
              const dayDate = new Date(monday);
              dayDate.setDate(monday.getDate() + targetDaysFromMonday);
              
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
          <div style={{ marginBottom: '12px', position: 'relative' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase' }}>Placa del Vehículo</label>
            <input 
              name="placa"
              placeholder="Ej: ABC123"
              value={formData.placa}
              onChange={handleInputChange}
              onFocus={() => {
                if (placaSuggestions.length > 0) setShowSuggestions(true);
              }}
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
            
            {/* Dropdown de sugerencias */}
            {showSuggestions && placaSuggestions.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: '#ffffff',
                border: '1px solid #d1d5db',
                borderTop: 'none',
                borderRadius: '0 0 6px 6px',
                maxHeight: '200px',
                overflowY: 'auto',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                zIndex: 1000
              }}>
                {placaSuggestions.map((vehicle, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        placa: vehicle.PLACA,
                        tipoVehiculo: vehicle.FAMILIA,
                        marca: vehicle.MARCA,
                        modelo: vehicle.DESCRIPCION
                      }));
                      setShowSuggestions(false);
                    }}
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      borderBottom: idx < placaSuggestions.length - 1 ? '1px solid #f3f4f6' : 'none',
                      backgroundColor: '#ffffff',
                      transition: 'background-color 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                  >
                    <div style={{ fontWeight: '700', fontSize: '14px', color: '#1f2937', letterSpacing: '1px' }}>
                      {vehicle.PLACA}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                      {vehicle.MARCA} - {vehicle.FAMILIA}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase' }}>Kilometraje</label>
              <input 
                name="kmInicio"
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={formData.kmInicio}
                onChange={handleInputChange}
                style={{ 
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  boxSizing: 'border-box',
                  backgroundColor: '#ffffff',
                  fontSize: '15px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase' }}>Ciudad</label>
              <input 
                name="ciudad"
                value={formData.ciudad}
                onChange={handleInputChange}
                style={{ 
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  boxSizing: 'border-box',
                  backgroundColor: '#ffffff',
                  fontSize: '15px'
                }}
              />
            </div>
          </div>
          
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase' }}>Conductor</label>
            <input 
              name="conductor"
              placeholder="Nombre completo"
              value={formData.conductor}
              onChange={handleInputChange}
              style={{ 
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                boxSizing: 'border-box',
                backgroundColor: '#ffffff',
                fontSize: '15px'
              }}
            />
          </div>
          
          {/* Selector de combustible */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase' }}>Tipo de Combustible</label>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {['GASOLINA', 'DIESEL', 'GAS'].map(tipo => (
                <label 
                  key={tipo}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    cursor: 'pointer',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '2px solid',
                    borderColor: formData.combustible === tipo ? '#1e40af' : '#e5e7eb',
                    backgroundColor: formData.combustible === tipo ? '#eff6ff' : '#ffffff',
                    transition: 'all 0.2s',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: formData.combustible === tipo ? '#1e40af' : '#6b7280'
                  }}
                >
                  <input 
                    type="radio"
                    name="combustible"
                    value={tipo}
                    checked={formData.combustible === tipo}
                    onChange={handleInputChange}
                    style={{ margin: 0, cursor: 'pointer' }}
                  />
                  <span>{tipo}</span>
                </label>
              ))}
            </div>
          </div>
          
          {/* Categoría de Licencia */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase' }}>Categoría de Licencia</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {['B1', 'B2', 'B3', 'C1', 'C2', 'C3'].map(cat => (
                <label 
                  key={cat}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    cursor: 'pointer',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '2px solid',
                    borderColor: formData.licenciaCategoria.includes(cat) ? '#059669' : '#e5e7eb',
                    backgroundColor: formData.licenciaCategoria.includes(cat) ? '#d1fae5' : '#ffffff',
                    transition: 'all 0.2s',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: formData.licenciaCategoria.includes(cat) ? '#047857' : '#6b7280'
                  }}
                >
                  <input 
                    type="checkbox"
                    value={cat}
                    checked={formData.licenciaCategoria.includes(cat)}
                    onChange={handleLicenciaCategoriaChange}
                    style={{ margin: 0, cursor: 'pointer' }}
                  />
                  <span>{cat}</span>
                </label>
              ))}
            </div>
          </div>
          
          {/* Vencimiento de Licencia */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase' }}>Vencimiento de Licencia</label>
            <input 
              name="licenciaVencimiento"
              type="date"
              value={formData.licenciaVencimiento}
              onChange={handleInputChange}
              style={{ 
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                boxSizing: 'border-box',
                backgroundColor: '#ffffff',
                fontSize: '15px',
                WebkitAppearance: 'none',
                MozAppearance: 'none'
              }}
            />
          </div>
          
          {/* SOTA, RTM, POLIZA */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase' }}>SOTA (Seguro Obligatorio)</label>
              <input 
                name="sota"
                type="date"
                value={formData.sota}
                onChange={handleInputChange}
                style={{ 
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  boxSizing: 'border-box',
                  backgroundColor: '#ffffff',
                  fontSize: '15px',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none'
                }}
              />
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase' }}>RTM (Revisión Técnico Mecánica)</label>
              <input 
                name="rtm"
                type="date"
                value={formData.rtm}
                onChange={handleInputChange}
                style={{ 
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  boxSizing: 'border-box',
                  backgroundColor: '#ffffff',
                  fontSize: '15px',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase' }}>Póliza (Certificado de Gases)</label>
              <input 
                name="poliza"
                type="date"
                value={formData.poliza}
                onChange={handleInputChange}
                style={{ 
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  boxSizing: 'border-box',
                  backgroundColor: '#ffffff',
                  fontSize: '15px',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none'
                }}
              />
            </div>
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
          
          {/* Botón Firmar Preoperacional */}
          <button
            onClick={abrirModalFirma}
            style={{
              width: '100%',
              padding: '14px',
              background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '15px',
              fontWeight: '700',
              cursor: 'pointer',
              marginBottom: '12px',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            ✍️ Firmar Preoperacional
            {(firmas.conductor || firmas.sst) && (
              <span style={{ 
                backgroundColor: 'rgba(255,255,255,0.3)', 
                padding: '2px 8px', 
                borderRadius: '12px',
                fontSize: '11px'
              }}>
                {firmas.conductor && firmas.sst ? '2 firmas' : '1 firma'}
              </span>
            )}
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
    
    {/* Modal de Confirmación Personalizado */}
    {modalConfig.isOpen && (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px'
      }}>
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          maxWidth: '400px',
          width: '100%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          animation: 'slideIn 0.2s ease-out'
        }}>
          {/* Header del modal */}
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h3 style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: '700',
              color: '#1f2937',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              {modalConfig.title}
            </h3>
            {modalConfig.showCloseButton && (
              <button
                onClick={modalConfig.onClose || (() => setModalConfig(prev => ({ ...prev, isOpen: false })))}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#9ca3af',
                  padding: '4px',
                  borderRadius: '4px',
                  lineHeight: 1
                }}
              >
                ✕
              </button>
            )}
          </div>
          
          {/* Cuerpo del modal */}
          <div style={{
            padding: '24px',
            fontSize: '14px',
            color: '#4b5563',
            lineHeight: '1.6',
            whiteSpace: 'pre-line'
          }}>
            {modalConfig.message}
          </div>
          
          {/* Footer con botones */}
          <div style={{
            padding: '16px 24px',
            backgroundColor: '#f9fafb',
            borderTop: '1px solid #e5e7eb',
            borderRadius: '0 0 16px 16px',
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end'
          }}>
            {modalConfig.onCancel && modalConfig.cancelText && (
              <button
                onClick={modalConfig.onCancel}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#ffffff',
                  color: '#6b7280',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
              >
                {modalConfig.cancelText}
              </button>
            )}
            
            <button
              onClick={modalConfig.onConfirm}
              style={{
                padding: '10px 24px',
                backgroundColor: '#1e40af',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1e3a8a'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1e40af'}
            >
              {modalConfig.confirmText}
            </button>
          </div>
        </div>
      </div>
    )}
    
    {/* Modal de Firma Digital */}
    {showFirmaModal && (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '20px'
      }}>
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          maxWidth: '450px',
          width: '100%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          animation: 'slideIn 0.2s ease-out'
        }}>
          {/* Header */}
          <div style={{
            padding: '20px 24px',
            borderBottom: '2px solid #e5e7eb',
            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
            borderRadius: '16px 16px 0 0'
          }}>
            <h3 style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: '700',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              ✍️ Firma Digital - {tipoFirma === 'conductor' ? 'Conductor' : 'Responsable SST'}
            </h3>
          </div>
          
          {/* Formulario */}
          <div style={{
            padding: '24px'
          }}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '13px', 
                fontWeight: '600', 
                color: '#374151', 
                marginBottom: '6px' 
              }}>
                Nombre Completo *
              </label>
              <input
                type="text"
                value={firmaFormData.nombre}
                onChange={(e) => setFirmaFormData(prev => ({ ...prev, nombre: e.target.value }))}
                placeholder="Ej: Juan Pérez García"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#10b981'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '13px', 
                fontWeight: '600', 
                color: '#374151', 
                marginBottom: '6px' 
              }}>
                Cédula de Ciudadanía *
              </label>
              <input
                type="text"
                value={firmaFormData.cc}
                onChange={(e) => setFirmaFormData(prev => ({ ...prev, cc: e.target.value.replace(/\D/g, '') }))}
                placeholder="Ej: 1234567890"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#10b981'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '13px', 
                fontWeight: '600', 
                color: '#374151', 
                marginBottom: '6px' 
              }}>
                Cargo *
              </label>
              <input
                type="text"
                value={firmaFormData.cargo}
                onChange={(e) => setFirmaFormData(prev => ({ ...prev, cargo: e.target.value }))}
                placeholder={tipoFirma === 'conductor' ? 'Ej: Conductor' : 'Ej: Responsable SST'}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#10b981'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
            </div>
            
            {/* Preview de firma */}
            <div style={{
              padding: '16px',
              backgroundColor: '#f0fdf4',
              border: '2px dashed #10b981',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#059669', marginBottom: '8px' }}>
                👁️ Vista previa de la firma:
              </div>
              <div style={{ 
                fontSize: '13px', 
                color: '#374151', 
                lineHeight: '1.6',
                fontStyle: 'italic'
              }}>
                {firmaFormData.nombre || '[Nombre completo]'}<br />
                CC: {firmaFormData.cc || '[Cédula]'}<br />
                {firmaFormData.cargo || '[Cargo]'}<br />
                <br />
                <span style={{ fontSize: '11px', color: '#6b7280' }}>
                  "Firmado digitalmente el {new Date().toLocaleDateString('es-CO')}"<br />
                  ✓ Grupo Ortiz - Firma Electrónica
                </span>
              </div>
            </div>
          </div>
          
          {/* Footer */}
          <div style={{
            padding: '16px 24px',
            backgroundColor: '#f9fafb',
            borderTop: '1px solid #e5e7eb',
            borderRadius: '0 0 16px 16px',
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end'
          }}>
            <button
              onClick={() => {
                setShowFirmaModal(false);
                setFirmaFormData({ nombre: '', cc: '', cargo: '' });
              }}
              style={{
                padding: '10px 20px',
                backgroundColor: '#ffffff',
                color: '#6b7280',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
            >
              Cancelar
            </button>
            
            <button
              onClick={guardarFirma}
              style={{
                padding: '10px 24px',
                backgroundColor: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#047857'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#059669'}
            >
              ✓ Confirmar Firma
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
