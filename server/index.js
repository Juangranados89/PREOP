import express from 'express';
import cors from 'cors';
import libre from 'libreoffice-convert';
import { promisify } from 'util';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3001;

// Promisificar la función de conversión
const convertAsync = promisify(libre.convert);

// Configuración de CORS para GitHub Codespaces
const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (como Postman, curl, etc.)
    if (!origin) return callback(null, true);
    
    // Permitir localhost para desarrollo local
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Permitir GitHub Codespaces
    if (origin.includes('.app.github.dev')) {
      return callback(null, true);
    }
    
    // Permitir otros orígenes configurados
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', limit: '50mb' }));

// Endpoint de salud
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor funcionando correctamente' });
});

// Endpoint para convertir Excel a PDF
app.post('/api/convert-to-pdf', async (req, res) => {
  try {
    console.log('📥 Recibiendo solicitud de conversión...');
    
    // El buffer del Excel viene en req.body
    const excelBuffer = req.body;
    
    if (!excelBuffer || excelBuffer.length === 0) {
      return res.status(400).json({ error: 'No se recibió el archivo Excel' });
    }

    console.log(`📊 Archivo Excel recibido: ${excelBuffer.length} bytes`);

    // Convertir Excel a PDF usando LibreOffice
    // Usamos opciones de filtro para PDF que respeta la configuración de página del Excel
    console.log('🔄 Convirtiendo Excel a PDF...');
    
    // Opciones para que LibreOffice ajuste a 1 página
    const filterOptions = 'calc_pdf_Export:{"PageRange":{"type":"string","value":"1"}}';
    
    const pdfBuffer = await convertAsync(excelBuffer, '.pdf', undefined);
    
    console.log(`✅ PDF generado: ${pdfBuffer.length} bytes`);

    // Enviar el PDF como respuesta
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=preoperacional.pdf');
    res.send(pdfBuffer);

  } catch (error) {
    console.error('❌ Error en conversión:', error);
    res.status(500).json({ 
      error: 'Error al convertir el archivo',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor backend iniciado en http://localhost:${PORT}`);
  console.log(`📡 Endpoint de conversión: http://localhost:${PORT}/api/convert-to-pdf`);
  console.log(`💚 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📡 Accesible desde: http://0.0.0.0:${PORT}`);
});

// Manejo de errores no capturados
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});
