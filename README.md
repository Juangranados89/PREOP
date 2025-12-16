# PREOP - Generador de Preoperacionales Grupo Ortiz

Aplicación web progresiva (PWA) para inspección preoperacional de vehículos.

## 🚀 Características

- ✅ **62 ítems de inspección** organizados en 10 secciones
- 📊 **Generación de Excel** con formato corporativo
- 📄 **Conversión a PDF** con formato idéntico al Excel (usando LibreOffice)
- 🗄️ **Base de datos** de 739 vehículos con autocompletado
- ✍️ **Firmas digitales** para Conductor y Responsable SST
- 📅 **Calendario semanal** con navegación entre días
- 📱 **Optimizado para móviles** con campos táctiles mejorados
- 💾 **Persistencia local** con localStorage
- 🔄 **Replicación de datos** entre días consecutivos

## 📋 Requisitos Previos

- **Node.js** v18 o superior
- **npm** v8 o superior
- **LibreOffice** instalado en el sistema (para conversión PDF)

### Instalación de LibreOffice

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y libreoffice-calc libreoffice-writer libreoffice-common
```

**macOS:**
```bash
brew install libreoffice
```

**Windows:**
Descargar desde [libreoffice.org](https://www.libreoffice.org/download/download/)

## 🛠️ Instalación

1. Clonar el repositorio:
```bash
git clone <repository-url>
cd PREOP
```

2. Instalar dependencias:
```bash
npm install
```

3. Verificar LibreOffice:
```bash
which libreoffice  # o 'which soffice' en macOS
```

## 🚀 Ejecución

### Desarrollo (Frontend + Backend simultáneamente)

```bash
npm run start:all
```

Esto iniciará:
- **Frontend** en http://localhost:5173
- **Backend** en http://localhost:3001

### Solo Frontend

```bash
npm run dev
```

### Solo Backend

```bash
npm run server:dev
```

## 🏗️ Arquitectura

### Frontend (React + Vite)
- **React 18.2.0**: Framework principal
- **Vite 5.1.4**: Build tool y dev server
- **TailwindCSS 3.4.19**: Estilos utility-first
- **ExcelJS 4.4.0**: Manipulación de archivos Excel
- **Firebase 10.8.0**: Autenticación y almacenamiento (configuración pendiente)

### Backend (Node.js + Express)
- **Express**: Servidor API REST
- **libreoffice-convert**: Conversión Excel → PDF usando LibreOffice
- **CORS**: Habilitado para desarrollo

### Endpoints del Backend

#### `GET /api/health`
Health check del servidor.

**Respuesta:**
```json
{
  "status": "ok",
  "message": "Servidor funcionando correctamente"
}
```

#### `POST /api/convert-to-pdf`
Convierte un archivo Excel a PDF manteniendo el formato corporativo.

**Headers:**
```
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

**Body:** Buffer del archivo Excel (raw binary)

**Respuesta:** PDF file (application/pdf)

## 📊 Estructura de Datos

### Mapeo de Celdas Excel

**Encabezado:**
- `C5`: Tipo de Vehículo
- `H5`: Placa
- `M5`: Modelo
- `V5`: Km Inicial
- `C6`: Marca
- `H6`: Mes/Año
- `N6/R6/V6`: Combustible (Gasolina/Diesel/Gas)
- `C8`: Conductor
- `H8`: Ciudad

**Documentos:**
- `D15`: Licencia de Conducción + Categoría
- `D16`: SOTA
- `D17`: RTM
- `D18`: Póliza

**Firmas:**
- `A98-A99`: Conductor (Nombre, CC, Cargo, Fecha, Firma)
- `M98-M99`: Responsable SST (Nombre, CC, Cargo, Fecha, Firma)

**Checklist:**
- Filas: 14-91 (ítems 1-66)
- Columnas por día: E-Y (Lunes-Domingo, 3 columnas cada uno: C/NC/NA)

### Base de Datos de Vehículos

739 vehículos con:
- `PLACA`: Placa del vehículo
- `MARCA`: Marca del vehículo
- `FAMILIA`: Familia o tipo de vehículo
- `DESCRIPCION`: Descripción detallada

## 🔧 Configuración

### Variables de Entorno

Crear archivo `.env` (opcional):

```env
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

### Configuración del Frontend

En `src/App.jsx`, el endpoint del backend se puede configurar:

```javascript
const response = await fetch('http://localhost:3001/api/convert-to-pdf', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  },
  body: excelBuffer
});
```

## 📦 Scripts Disponibles

- `npm run dev`: Inicia frontend (Vite)
- `npm run build`: Construye para producción
- `npm run preview`: Preview del build de producción
- `npm run server`: Inicia backend (producción)
- `npm run server:dev`: Inicia backend (desarrollo con nodemon)
- `npm run start:all`: Inicia frontend + backend simultáneamente

## 🐛 Solución de Problemas

### Error: "LibreOffice no instalado"

**Problema:** El backend no puede convertir Excel a PDF.

**Solución:**
```bash
# Ubuntu/Debian
sudo apt-get install -y libreoffice-calc libreoffice-writer

# macOS
brew install libreoffice
```

### Error: "Port 3001 already in use"

**Problema:** El puerto del backend ya está en uso.

**Solución:**
```bash
# Encontrar el proceso
lsof -i :3001

# Matar el proceso
kill -9 <PID>

# O cambiar el puerto en server/index.js
const PORT = process.env.PORT || 3002;
```

### Error: "CORS policy"

**Problema:** El frontend no puede comunicarse con el backend.

**Solución:** Verificar que el backend tenga CORS configurado:
```javascript
app.use(cors());
```

### PDF generado está vacío o corrupto

**Problema:** LibreOffice no puede procesar el Excel.

**Solución:**
- Verificar que la plantilla `public/plantilla.xlsx` esté presente
- Verificar permisos de archivo
- Revisar logs del backend con `npm run server:dev`

## 📝 Licencia

Este proyecto es propiedad del Grupo Ortiz.

## 👥 Mantenimiento

- **Desarrollo**: Sistema de Inspección Preoperacional
- **Contacto**: [Información de contacto]
