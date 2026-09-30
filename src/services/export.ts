import * as XLSX from 'xlsx-js-style'
import {
  getInspectionPhotos,
  getAllInspectionsForExport,
} from './inspection'
import type { Inspection } from '../types'

function formatDate(value: string) {
  return new Date(value).toLocaleString('id-ID', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

function statusLabel(status: Inspection['status']) {
  switch (status) {
    case 'Critical':
      return 'CRITICAL'
    case 'Refill':
      return 'REFILL REQUIRED'
    case 'Normal':
      return 'SAFE / NORMAL'
    default:
      return 'NOT CONFIGURED'
  }
}

/*
|--------------------------------------------------------------------------
| STYLE
|--------------------------------------------------------------------------
*/

const borderStyle = {
  top: {
    style: 'thin',
    color: { rgb: 'D9E1F2' },
  },
  bottom: {
    style: 'thin',
    color: { rgb: 'D9E1F2' },
  },
  left: {
    style: 'thin',
    color: { rgb: 'D9E1F2' },
  },
  right: {
    style: 'thin',
    color: { rgb: 'D9E1F2' },
  },
}

const headerStyle = {
  font: {
    bold: true,
    color: { rgb: 'FFFFFF' },
    sz: 11,
  },
  fill: {
    fgColor: { rgb: '1F4E78' },
  },
  alignment: {
    horizontal: 'center',
    vertical: 'center',
    wrapText: true,
  },
  border: borderStyle,
}

const centerStyle = {
  alignment: {
    horizontal: 'center',
    vertical: 'center',
    wrapText: true,
  },
  border: borderStyle,
}

const leftStyle = {
  alignment: {
    horizontal: 'left',
    vertical: 'center',
    wrapText: true,
  },
  border: borderStyle,
}

/*
|--------------------------------------------------------------------------
| INSPECTION SHEET
|--------------------------------------------------------------------------
*/

function createInspectionSheet(
  rows: Inspection[],
  photoCounts: Record<string, number>,
) {
  const header = [
    'No',
    'Date / Time',
    'Gas Type',
    'In Quantity (KGS)',
    'Pressure',
    'Pressure Unit',
    'Status',
    'Checked By',
    'Remarks',
    'Photo Count',
  ]

  const data = rows.map((row, index) => [
    index + 1,
    formatDate(row.inspection_date),
    row.gas_type,
    row.in_kgs ?? 0,
    row.pressure,
    row.pressure_unit,
    statusLabel(row.status),
    row.inspector_name,
    row.notes ?? '',
    photoCounts[row.id] ?? 0,
  ])

  const sheet = XLSX.utils.aoa_to_sheet([
    header,
    ...data,
  ])

  /*
  |--------------------------------------------------------------------------
  | COLUMN WIDTH
  |--------------------------------------------------------------------------
  */

  sheet['!cols'] = [
    { wch: 7 },
    { wch: 23 },
    { wch: 14 },
    { wch: 19 },
    { wch: 14 },
    { wch: 16 },
    { wch: 21 },
    { wch: 22 },
    { wch: 35 },
    { wch: 14 },
  ]

  /*
  |--------------------------------------------------------------------------
  | HEADER STYLE
  |--------------------------------------------------------------------------
  */

  for (let col = 0; col < 10; col++) {
    const address = XLSX.utils.encode_cell({
      r: 0,
      c: col,
    })

    const cell = sheet[address]

    if (cell) {
      cell.s = headerStyle
    }
  }

  /*
  |--------------------------------------------------------------------------
  | DATA STYLE
  |--------------------------------------------------------------------------
  */

  for (
    let row = 1;
    row <= data.length;
    row++
  ) {
    for (
      let col = 0;
      col < 10;
      col++
    ) {
      const address = XLSX.utils.encode_cell({
        r: row,
        c: col,
      })

      const cell = sheet[address]

      if (!cell) continue

      /*
       * Semua kolom rata tengah
       */
      cell.s = centerStyle

      /*
       * Remarks rata kiri
       */
      if (col === 8) {
        cell.s = leftStyle
      }
    }
  }

  /*
  |--------------------------------------------------------------------------
  | NUMBER FORMAT
  |--------------------------------------------------------------------------
  */

  for (
    let row = 1;
    row <= data.length;
    row++
  ) {
    const pressureCell =
      sheet[
        XLSX.utils.encode_cell({
          r: row,
          c: 4,
        })
      ]

    if (pressureCell) {
      pressureCell.s = {
        ...centerStyle,
        numFmt: '0.000',
      }
    }

    const quantityCell =
      sheet[
        XLSX.utils.encode_cell({
          r: row,
          c: 3,
        })
      ]

    if (quantityCell) {
      quantityCell.s = {
        ...centerStyle,
        numFmt: '0.00',
      }
    }
  }

  /*
  |--------------------------------------------------------------------------
  | ROW HEIGHT
  |--------------------------------------------------------------------------
  */

  sheet['!rows'] = [
    {
      hpt: 32,
    },
  ]

  /*
  |--------------------------------------------------------------------------
  | FREEZE HEADER
  |--------------------------------------------------------------------------
  */

  sheet['!freeze'] = {
    xSplit: 0,
    ySplit: 1,
  }

  /*
  |--------------------------------------------------------------------------
  | FILTER
  |--------------------------------------------------------------------------
  */

  if (data.length > 0) {
    sheet['!autofilter'] = {
      ref: `A1:J${data.length + 1}`,
    }
  }

  return sheet
}

/*
|--------------------------------------------------------------------------
| SUMMARY SHEET
|--------------------------------------------------------------------------
*/

function createSummarySheet(
  inspections: Inspection[],
  co2: Inspection[],
  argon: Inspection[],
) {
  const latestCO2 = co2[0]
  const latestArgon = argon[0]

  const data = [
    [
      'GAS TANK MONITORING SYSTEM',
      '',
    ],
    [
      'PT TSI SMART PRODUCTS',
      '',
    ],
    [],
    [
      'REPORT SUMMARY',
      '',
    ],
    [],
    [
      'Item',
      'Value',
    ],
    [
      'Total Inspection',
      inspections.length,
    ],
    [
      'Total CO₂ Inspection',
      co2.length,
    ],
    [
      'Total Argon Inspection',
      argon.length,
    ],
    [],
    [
      'LATEST CO₂',
      '',
    ],
    [
      'Status',
      latestCO2
        ? statusLabel(latestCO2.status)
        : 'NO DATA',
    ],
    [
      'Pressure',
      latestCO2
        ? `${latestCO2.pressure} ${latestCO2.pressure_unit}`
        : 'NO DATA',
    ],
    [
      'In Quantity',
      latestCO2
        ? `${latestCO2.in_kgs ?? 0} KGS`
        : 'NO DATA',
    ],
    [
      'Checked By',
      latestCO2
        ? latestCO2.inspector_name
        : 'NO DATA',
    ],
    [
      'Inspection Date',
      latestCO2
        ? formatDate(
            latestCO2.inspection_date,
          )
        : 'NO DATA',
    ],
    [],
    [
      'LATEST ARGON',
      '',
    ],
    [
      'Status',
      latestArgon
        ? statusLabel(latestArgon.status)
        : 'NO DATA',
    ],
    [
      'Pressure',
      latestArgon
        ? `${latestArgon.pressure} ${latestArgon.pressure_unit}`
        : 'NO DATA',
    ],
    [
      'In Quantity',
      latestArgon
        ? `${latestArgon.in_kgs ?? 0} KGS`
        : 'NO DATA',
    ],
    [
      'Checked By',
      latestArgon
        ? latestArgon.inspector_name
        : 'NO DATA',
    ],
    [
      'Inspection Date',
      latestArgon
        ? formatDate(
            latestArgon.inspection_date,
          )
        : 'NO DATA',
    ],
    [],
    [
      'Export Date',
      new Date().toLocaleString('id-ID'),
    ],
  ]

  const sheet =
    XLSX.utils.aoa_to_sheet(data)

  /*
  |--------------------------------------------------------------------------
  | COLUMN WIDTH
  |--------------------------------------------------------------------------
  */

  sheet['!cols'] = [
    { wch: 30 },
    { wch: 40 },
  ]

  /*
  |--------------------------------------------------------------------------
  | MERGE
  |--------------------------------------------------------------------------
  */

  sheet['!merges'] = [
    {
      s: { r: 0, c: 0 },
      e: { r: 0, c: 1 },
    },
    {
      s: { r: 1, c: 0 },
      e: { r: 1, c: 1 },
    },
    {
      s: { r: 3, c: 0 },
      e: { r: 3, c: 1 },
    },
    {
      s: { r: 10, c: 0 },
      e: { r: 10, c: 1 },
    },
    {
      s: { r: 17, c: 0 },
      e: { r: 17, c: 1 },
    },
  ]

  /*
  |--------------------------------------------------------------------------
  | TITLE
  |--------------------------------------------------------------------------
  */

  for (const address of [
    'A1',
    'A2',
    'A4',
    'A11',
    'A18',
  ]) {
    const cell = sheet[address]

    if (cell) {
      cell.s = {
        font: {
          bold: true,
          sz:
            address === 'A1'
              ? 18
              : 13,
          color: {
            rgb: '1F1F1F',
          },
        },
        alignment: {
          horizontal: 'left',
          vertical: 'center',
        },
      }
    }
  }

  /*
  |--------------------------------------------------------------------------
  | SUMMARY HEADER
  |--------------------------------------------------------------------------
  */

  for (const address of [
    'A6',
    'B6',
  ]) {
    const cell = sheet[address]

    if (cell) {
      cell.s = headerStyle
    }
  }

  /*
  |--------------------------------------------------------------------------
  | SUMMARY DATA
  |--------------------------------------------------------------------------
  */

  for (
    let row = 6;
    row <= 8;
    row++
  ) {
    for (
      let col = 0;
      col < 2;
      col++
    ) {
      const address =
        XLSX.utils.encode_cell({
          r: row,
          c: col,
        })

      const cell = sheet[address]

      if (cell) {
        cell.s =
          col === 0
            ? leftStyle
            : centerStyle
      }
    }
  }

  /*
  |--------------------------------------------------------------------------
  | CO₂ + ARGON DETAILS
  |--------------------------------------------------------------------------
  */

  const detailRows = [
    11,
    12,
    13,
    14,
    15,
    18,
    19,
    20,
    21,
    22,
  ]

  for (const row of detailRows) {
    for (
      let col = 0;
      col < 2;
      col++
    ) {
      const address =
        XLSX.utils.encode_cell({
          r: row,
          c: col,
        })

      const cell = sheet[address]

      if (cell) {
        cell.s =
          col === 0
            ? leftStyle
            : centerStyle
      }
    }
  }

  /*
  |--------------------------------------------------------------------------
  | EXPORT DATE
  |--------------------------------------------------------------------------
  */

  const exportDateCell =
    sheet['B26']

  if (exportDateCell) {
    exportDateCell.s = centerStyle
  }

  /*
  |--------------------------------------------------------------------------
  | ROW HEIGHT
  |--------------------------------------------------------------------------
  */

  sheet['!rows'] = [
    { hpt: 30 },
    { hpt: 22 },
    { hpt: 8 },
    { hpt: 25 },
  ]

  /*
  |--------------------------------------------------------------------------
  | FREEZE
  |--------------------------------------------------------------------------
  */

  sheet['!freeze'] = {
    xSplit: 0,
    ySplit: 5,
  }

  return sheet
}

/*
|--------------------------------------------------------------------------
| EXPORT EXCEL
|--------------------------------------------------------------------------
*/

export async function exportInspectionExcel() {
  /*
   * Ambil semua inspection
   */
  const inspections =
    await getAllInspectionsForExport()

  /*
   * Ambil semua foto
   */
  const photoRows =
    inspections.length > 0
      ? await getInspectionPhotos(
          inspections.map(
            (row) => row.id,
          ),
        )
      : []

  /*
   * Hitung jumlah foto
   */
  const photoCounts: Record<
    string,
    number
  > = {}

  for (const photo of photoRows) {
    photoCounts[
      photo.inspection_id
    ] =
      (photoCounts[
        photo.inspection_id
      ] ?? 0) + 1
  }

  /*
   * Pisahkan CO₂ dan Argon
   */
  const co2 =
    inspections.filter(
      (row) =>
        row.gas_type === 'CO₂',
    )

  const argon =
    inspections.filter(
      (row) =>
        row.gas_type === 'Argon',
    )

  /*
   * Workbook
   */
  const workbook =
    XLSX.utils.book_new()

  /*
   * Summary
   */
  const summarySheet =
    createSummarySheet(
      inspections,
      co2,
      argon,
    )

  XLSX.utils.book_append_sheet(
    workbook,
    summarySheet,
    'Summary',
  )

  /*
   * CO₂
   */
  const co2Sheet =
    createInspectionSheet(
      co2,
      photoCounts,
    )

  XLSX.utils.book_append_sheet(
    workbook,
    co2Sheet,
    'CO2',
  )

  /*
   * Argon
   */
  const argonSheet =
    createInspectionSheet(
      argon,
      photoCounts,
    )

  XLSX.utils.book_append_sheet(
    workbook,
    argonSheet,
    'Argon',
  )

  /*
   * Nama file
   */
  const date =
    new Date()
      .toISOString()
      .slice(0, 10)

  const filename =
    `Gas-Tank-Monitoring-${date}.xlsx`

  /*
   * Download
   */
  XLSX.writeFile(
    workbook,
    filename,
  )
}