/**
 * @author Gemini
 * @description Script completo para POS e Inventario.
 * AHORA INCLUYE:
 * 1. Descuento de stock.
 * 2. Nro. de Venta con prefijo "as".
 * 3. Búsqueda de ventas.
 * 4. Anulación de ventas con restauración de stock (corregido).
 * 5. Añade la columna "Estado" si no existe, evitando errores.
 */

const SPREADSHEET_ID = '1mJm83fKuAsV_cJ4BXA9OAaAK9kX9bR21zCa7HgRlo5M';
const INVENTORY_SHEET_NAME = 'Inventario';
const SALES_SHEET_NAME = 'Ventas';

function doGet(e) {
  return HtmlService.createHtmlOutput("<h1>API para Sistema POS e Inventario</h1><p>El script está activo y listo para recibir solicitudes POST.</p>");
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    
    switch (payload.action) {
      case 'getProducts':
        return getProducts();
      case 'getSales':
        return getSales();
      case 'addProduct':
        return addProduct(payload.data);
      case 'recordSale':
        return recordSale(payload.data);
      case 'annulSale':
        return annulSale(payload.data);
      default:
        throw new Error('Acción no válida.');
    }
  } catch (error) {
    Logger.log('Error en doPost: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: 'Error en la solicitud: ' + error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getProducts() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(INVENTORY_SHEET_NAME);
  if (!sheet) throw new Error(`La hoja "${INVENTORY_SHEET_NAME}" no fue encontrada.`);
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  const products = data.map(row => {
    let product = {};
    headers.forEach((header, index) => { product[header] = row[index]; });
    return product;
  });
  return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: products })).setMimeType(ContentService.MimeType.JSON);
}

function getSales() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SALES_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: [] })).setMimeType(ContentService.MimeType.JSON);
  
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  const sales = data.map(row => {
    let sale = {};
    headers.forEach((header, index) => { sale[header] = row[index]; });
    return sale;
  });
  return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: sales })).setMimeType(ContentService.MimeType.JSON);
}

function addProduct(data) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(INVENTORY_SHEET_NAME);
  const headers = ["Fecha de Registro", "Nombre", "Precio (Venta)", "Precio (Compra)", "Precio (Mayoreo)", "SKU", "Cantidad", "Código de Barras", "URL Foto 1"];

  if (!sheet) {
    sheet = spreadsheet.insertSheet(INVENTORY_SHEET_NAME);
    sheet.appendRow(headers);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  const newRow = [ new Date().toLocaleDateString(), data.nombre || "N/A", data.precioVenta || "N/A", data.precioCompra || "N/A", data.precioMayoreo || "N/A", data.sku || "N/A", data.cantidad || "N/A", data.codigoBarras || "N/A", data.urlFoto1 || "N/A" ];
  sheet.appendRow(newRow);
  
  return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Producto registrado.' })).setMimeType(ContentService.MimeType.JSON);
}

function recordSale(data) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  updateStock(spreadsheet, data.items, 'subtract');

  let salesSheet = spreadsheet.getSheetByName(SALES_SHEET_NAME);
  const salesHeaders = ["Nro. Venta", "Fecha de Venta", "Nombre Cliente", "Contacto", "NIT/CI", "Total Venta", "Productos Vendidos (JSON)", "Estado"];

  if (!salesSheet) {
    salesSheet = spreadsheet.insertSheet(SALES_SHEET_NAME);
    salesSheet.appendRow(salesHeaders);
  } else if (salesSheet.getLastRow() === 0) {
    salesSheet.appendRow(salesHeaders);
  }

  const lastRow = salesSheet.getLastRow();
  let saleId = "as1";
  if (lastRow > 1) {
    const lastSaleId = salesSheet.getRange(lastRow, 1).getValue().toString();
    if (lastSaleId && lastSaleId.toLowerCase().startsWith('as')) {
        const lastIdNumber = parseInt(lastSaleId.substring(2));
        if (!isNaN(lastIdNumber)) {
            saleId = 'as' + (lastIdNumber + 1);
        } else {
            saleId = 'as' + lastRow;
        }
    } else {
        saleId = 'as' + lastRow;
    }
  }

  const newRow = [ saleId, new Date().toLocaleDateString(), data.customer.name || "N/A", data.customer.contact || "N/A", data.customer.id || "N/A", data.total || 0, JSON.stringify(data.items), "Completada" ];
  salesSheet.appendRow(newRow);

  return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Venta registrada.', saleId: saleId })).setMimeType(ContentService.MimeType.JSON);
}

function annulSale(data) {
  const saleId = data.saleId;
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const salesSheet = spreadsheet.getSheetByName(SALES_SHEET_NAME);
  if (!salesSheet) throw new Error("Hoja de ventas no encontrada.");

  const dataRange = salesSheet.getDataRange();
  const values = dataRange.getValues();
  let headers = values[0];
  
  let stateColumn = headers.indexOf("Estado");
  if (stateColumn === -1) {
    const newHeaderColumn = headers.length + 1;
    salesSheet.getRange(1, newHeaderColumn).setValue("Estado");
    headers.push("Estado");
    stateColumn = headers.length - 1;
  }

  const saleIdColumn = headers.indexOf("Nro. Venta");
  const productsColumn = headers.indexOf("Productos Vendidos (JSON)");

  if (saleIdColumn === -1 || productsColumn === -1) {
      throw new Error("La hoja 'Ventas' no tiene el formato correcto.");
  }
  
  let saleRowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (values[i][saleIdColumn].toString() == saleId) {
      saleRowIndex = i;
      break;
    }
  }

  if (saleRowIndex === -1) throw new Error("Venta no encontrada.");
  
  if (values[saleRowIndex][stateColumn] === "Anulada") {
    throw new Error("Esta venta ya ha sido anulada.");
  }

  const productsToRestore = JSON.parse(values[saleRowIndex][productsColumn]);
  updateStock(spreadsheet, productsToRestore, 'add');

  salesSheet.getRange(saleRowIndex + 1, stateColumn + 1).setValue("Anulada");
  
  return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: `Venta ${saleId} anulada y stock restaurado.` })).setMimeType(ContentService.MimeType.JSON);
}

function updateStock(spreadsheet, items, operation) {
  const inventorySheet = spreadsheet.getSheetByName(INVENTORY_SHEET_NAME);
  if (!inventorySheet) throw new Error(`La hoja de inventario "${INVENTORY_SHEET_NAME}" no fue encontrada.`);
  
  const inventoryData = inventorySheet.getDataRange().getValues();
  const invHeaders = inventoryData[0];
  const skuColumnIndex = invHeaders.indexOf("SKU");
  const quantityColumnIndex = invHeaders.indexOf("Cantidad");
  
  if (skuColumnIndex === -1 || quantityColumnIndex === -1) throw new Error("Columnas 'SKU' o 'Cantidad' no encontradas.");

  const skuToRowIndexMap = {};
  inventoryData.forEach((row, index) => {
    if (index > 0) {
      const sku = row[skuColumnIndex];
      if (sku) skuToRowIndexMap[sku.toString()] = index + 1;
    }
  });
  
  items.forEach(item => {
    const itemSku = item.SKU ? item.SKU.toString() : null;
    if (itemSku && skuToRowIndexMap[itemSku]) {
      const rowIndex = skuToRowIndexMap[itemSku];
      const quantityCell = inventorySheet.getRange(rowIndex, quantityColumnIndex + 1);
      const currentStock = parseFloat(quantityCell.getValue());
      
      if (!isNaN(currentStock)) {
        const change = operation === 'add' ? item.cantidad : -item.cantidad;
        quantityCell.setValue(currentStock + change);
      }
    }
  });
}
