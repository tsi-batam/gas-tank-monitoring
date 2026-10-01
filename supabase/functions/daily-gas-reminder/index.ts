import { createClient } from 'npm:@supabase/supabase-js@2'
import { Resend } from 'npm:resend@6'

/**
 * ============================================================
 * TSI SMART PRODUCTS
 * Gas Tank Monitoring System
 * Daily Gas Reminder Edge Function
 *
 * Schedule:
 * 10:00 WIB = 03:00 UTC
 *
 * Business rules:
 * - Pressure > Refill Threshold  -> no email
 * - Critical < Pressure <= Refill Threshold -> REFILL REQUIRED
 * - Pressure <= Critical Threshold -> CRITICAL
 * - In Quantity (KGS) > 0 -> starts a new gas cycle
 * - Reminder is sent once per gas per Jakarta calendar day
 * - Reminder uses the latest inspection in the active cycle
 * ============================================================
 */

/* ============================================================
 * ENVIRONMENT
 * ============================================================
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')

const secretKeysRaw =
  Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'

let secretKeys: Record<string, string> = {}

try {
  secretKeys = JSON.parse(secretKeysRaw) as Record<string, string>
} catch {
  throw new Error(
    'SUPABASE_SECRET_KEYS is not valid JSON.',
  )
}

const SUPABASE_SECRET_KEY =
  secretKeys.default ??
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const RESEND_API_KEY =
  Deno.env.get('RESEND_API_KEY')

const REMINDER_RECIPIENT =
  Deno.env.get('REMINDER_RECIPIENT') ??
  'santoniushasibuan1@gmail.com'

const REMINDER_RECIPIENTS =
  REMINDER_RECIPIENT
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)

const EMAIL_FROM =
  Deno.env.get('EMAIL_FROM') ??
  'onboarding@resend.dev'

if (!SUPABASE_URL) {
  throw new Error('Missing SUPABASE_URL.')
}

if (!SUPABASE_SECRET_KEY) {
  throw new Error(
    'Missing SUPABASE_SECRET_KEY or SUPABASE_SECRET_KEYS.default.',
  )
}

if (!RESEND_API_KEY) {
  throw new Error('Missing RESEND_API_KEY.')
}

if (REMINDER_RECIPIENTS.length === 0) {
  throw new Error('Missing REMINDER_RECIPIENT.')
}

if (!EMAIL_FROM) {
  throw new Error('Missing EMAIL_FROM.')
}

/* ============================================================
 * CLIENTS
 * ============================================================
 */

const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
)

const resend = new Resend(
  RESEND_API_KEY,
)

/* ============================================================
 * TYPES
 * ============================================================
 */

type GasType = 'CO₂' | 'Argon'

type ReminderSeverity =
  | 'Refill'
  | 'Critical'

interface InspectionRow {
  id: string
  inspection_date: string
  created_at: string
  gas_type: GasType
  in_kgs: number | null
  pressure: number
  pressure_unit: string
  inspector_name: string
  notes: string | null
}

interface GasSettingRow {
  gas_type: GasType
  pressure_unit: string
  refill_threshold: number | null
  critical_threshold: number | null
}

interface ActiveCycle {
  gasType: GasType
  refillInspection: InspectionRow | null
  latestInspection: InspectionRow
}

/* ============================================================
 * DATE / TIME
 * ============================================================
 */

function getJakartaDate(): string {
  return new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    },
  ).format(new Date())
}

function formatJakartaDateTime(
  value: string,
): string {
  return (
    new Intl.DateTimeFormat(
      'id-ID',
      {
        timeZone: 'Asia/Jakarta',
        dateStyle: 'medium',
        timeStyle: 'short',
      },
    ).format(new Date(value)) +
    ' WIB'
  )
}

/* ============================================================
 * HELPERS
 * ============================================================
 */

function escapeHtml(
  value: unknown,
): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function isRefill(
  row: InspectionRow,
): boolean {
  return Number(row.in_kgs ?? 0) > 0
}

function compareInspectionDate(
  a: InspectionRow,
  b: InspectionRow,
): number {
  const dateA =
    new Date(
      a.inspection_date,
    ).getTime()

  const dateB =
    new Date(
      b.inspection_date,
    ).getTime()

  if (dateA !== dateB) {
    return dateA - dateB
  }

  return (
    new Date(
      a.created_at,
    ).getTime() -
    new Date(
      b.created_at,
    ).getTime()
  )
}

/* ============================================================
 * LOAD INSPECTIONS
 * ============================================================
 */

async function getInspectionHistory(): Promise<
  InspectionRow[]
> {
  const { data, error } =
    await supabaseAdmin
      .from('inspections')
      .select(
        `
        id,
        inspection_date,
        created_at,
        gas_type,
        in_kgs,
        pressure,
        pressure_unit,
        inspector_name,
        notes
      `,
      )
      .order(
        'inspection_date',
        {
          ascending: true,
        },
      )
      .order(
        'created_at',
        {
          ascending: true,
        },
      )

  if (error) {
    throw new Error(
      `Failed to load inspections: ${error.message}`,
    )
  }

  return (
    data ?? []
  ) as InspectionRow[]
}

/* ============================================================
 * LOAD GAS SETTINGS
 * ============================================================
 */

async function getSettings(): Promise<
  GasSettingRow[]
> {
  const { data, error } =
    await supabaseAdmin
      .from('gas_settings')
      .select(
        `
        gas_type,
        pressure_unit,
        refill_threshold,
        critical_threshold
      `,
      )

  if (error) {
    throw new Error(
      `Failed to load gas settings: ${error.message}`,
    )
  }

  return (
    data ?? []
  ) as GasSettingRow[]
}

/* ============================================================
 * ACTIVE CYCLE
 * ============================================================
 */

function getActiveCycles(
  inspections: InspectionRow[],
): ActiveCycle[] {
  const grouped =
    new Map<
      GasType,
      InspectionRow[]
    >()

  for (const inspection of inspections) {
    const existing =
      grouped.get(
        inspection.gas_type,
      )

    if (existing) {
      existing.push(
        inspection,
      )
    } else {
      grouped.set(
        inspection.gas_type,
        [inspection],
      )
    }
  }

  const cycles: ActiveCycle[] = []

  for (
    const [
      gasType,
      rows,
    ] of grouped.entries()
  ) {
    rows.sort(
      compareInspectionDate,
    )

    const refillRows =
      rows.filter(isRefill)

    const latestRefill =
      refillRows.length > 0
        ? refillRows[
            refillRows.length - 1
          ]
        : null

    let activeRows: InspectionRow[]

    if (latestRefill) {
      activeRows =
        rows.filter(
          (row) =>
            compareInspectionDate(
              row,
              latestRefill,
            ) >= 0,
        )
    } else {
      activeRows = rows
    }

    if (!activeRows.length) {
      continue
    }

    const latestInspection =
      activeRows[
        activeRows.length - 1
      ]

    cycles.push({
      gasType,
      refillInspection:
        latestRefill,
      latestInspection,
    })
  }

  return cycles
}

/* ============================================================
 * STATUS / SEVERITY
 * ============================================================
 */

function getSeverity(
  pressure: number,
  refillThreshold: number | null,
  criticalThreshold: number | null,
): ReminderSeverity | null {
  if (
    criticalThreshold !== null &&
    pressure <= criticalThreshold
  ) {
    return 'Critical'
  }

  if (
    refillThreshold !== null &&
    pressure <= refillThreshold
  ) {
    return 'Refill'
  }

  return null
}

/* ============================================================
 * EMAIL
 * ============================================================
 */

function buildEmail(
  row: InspectionRow,
  refillThreshold: number,
  criticalThreshold: number,
  severity: ReminderSeverity,
) {
  const isCritical =
    severity === 'Critical'

  const statusText =
    isCritical
      ? 'CRITICAL'
      : 'REFILL REQUIRED'

  const subject =
    isCritical
      ? `[URGENT] CRITICAL GAS PRESSURE - ${row.gas_type} ${row.pressure} ${row.pressure_unit}`
      : `[REFILL REQUIRED] Gas Tank ${row.gas_type} - ${row.pressure} ${row.pressure_unit}`

  const title =
    isCritical
      ? 'CRITICAL GAS PRESSURE'
      : 'REFILL REQUIRED'

  /* ==========================================================
   * ALARM COLORS
   * ==========================================================
   */

  const alarmColor =
    '#dc2626'

  const alarmBackground =
    '#fee2e2'

  /* ==========================================================
   * ALARM INTRODUCTION
   * ==========================================================
   */

  const intro =
    isCritical
      ? `
      <strong style="
        color:${alarmColor};
      ">
        URGENT - CRITICAL CONDITION
      </strong>

      <br><br>

      <span style="
        color:${alarmColor};
      ">
        The Gas Tank Monitoring System has detected that the gas pressure
        has reached or fallen below
        <strong>Critical Threshold</strong>.
      </span>
    `
      : `
      <strong style="
        color:${alarmColor};
      ">
        REFILL REQUIRED
      </strong>

      <br><br>

      <span style="
        color:${alarmColor};
      ">
        The Gas Tank Monitoring System has detected that the gas pressure
        has reached or fallen below
        <strong>Refill Threshold</strong>.
      </span>
    `

  /* ==========================================================
   * ACTION TEXT
   * ==========================================================
   */

  const actionText =
    isCritical
      ? 'Please check the gas tank condition immediately and take the necessary action according to the company safety procedures.'
      : 'Please check the gas tank condition and refill the gas according to the company procedures.'

  /* ==========================================================
   * REFILL THRESHOLD ROW
   * ==========================================================
   */

  const refillThresholdRow =
    isCritical
      ? `
        <tr>
          <td style="
            border:1px solid #dfe3e8;
          ">
            <strong>
              Refill Threshold
            </strong>
          </td>

          <td style="
            border:1px solid #dfe3e8;
          ">
            ${escapeHtml(
              refillThreshold,
            )}
            ${escapeHtml(
              row.pressure_unit,
            )}
          </td>
        </tr>
      `
      : `
        <tr>
          <td style="
            border:1px solid ${alarmColor};
            background:${alarmBackground};
            color:${alarmColor};
          ">
            <strong>
              Refill Threshold
            </strong>
          </td>

          <td style="
            border:1px solid ${alarmColor};
            background:${alarmBackground};
            color:${alarmColor};
          ">
            <strong>
              ${escapeHtml(
                refillThreshold,
              )}
              ${escapeHtml(
                row.pressure_unit,
              )}
            </strong>
          </td>
        </tr>
      `

  /* ==========================================================
   * CRITICAL THRESHOLD ROW
   * ==========================================================
   */

  const criticalThresholdRow =
    isCritical
      ? `
        <tr>
          <td style="
            border:1px solid ${alarmColor};
            background:${alarmBackground};
            color:${alarmColor};
          ">
            <strong>
              Critical Threshold
            </strong>
          </td>

          <td style="
            border:1px solid ${alarmColor};
            background:${alarmBackground};
            color:${alarmColor};
          ">
            <strong>
              ${escapeHtml(
                criticalThreshold,
              )}
              ${escapeHtml(
                row.pressure_unit,
              )}
            </strong>
          </td>
        </tr>
      `
      : `
        <tr>
          <td style="
            border:1px solid #dfe3e8;
          ">
            <strong>
              Critical Threshold
            </strong>
          </td>

          <td style="
            border:1px solid #dfe3e8;
          ">
            ${escapeHtml(
              criticalThreshold,
            )}
            ${escapeHtml(
              row.pressure_unit,
            )}
          </td>
        </tr>
      `

  /* ==========================================================
   * SYSTEM ACCESS
   * ==========================================================
   */

  const systemAccess = `
    <div style="
      margin:25px 0;
      padding:20px;
      background:#f8fafc;
      border:1px solid #e1e5ea;
      border-radius:8px;
    ">

      <h3 style="
        margin:0 0 14px 0;
        color:#172033;
        font-size:17px;
      ">
        System Access
      </h3>

      <p style="
        margin:0 0 14px 0;
        color:#172033;
      ">
        To check the inspection data,
        please visit the link below.
      </p>

      <p style="
        margin:0 0 14px 0;
      ">
        <strong>
          Gas Tank Monitoring System
        </strong>
      </p>

      <p style="
        margin:6px 0;
      ">
        <strong>
          Username:
        </strong>
        tsp
      </p>

      <p style="
        margin:6px 0 18px 0;
      ">
        <strong>
          Password:
        </strong>
        tsp08112023
      </p>

      <a
        href="https://gas-tank-monitoring.vercel.app/"
        target="_blank"
        style="
          display:inline-block;
          padding:10px 18px;
          background:#172033;
          color:#ffffff;
          text-decoration:none;
          border-radius:6px;
          font-weight:bold;
        "
      >
        Open Gas Tank Monitoring System
      </a>

    </div>
  `

  /* ==========================================================
   * EMAIL HTML
   * ==========================================================
   */

  const html = `
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">

  <title>
    ${escapeHtml(title)}
  </title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#f4f6f8;
  font-family:Arial,Helvetica,sans-serif;
  color:#172033;
">

  <div style="
    max-width:700px;
    margin:30px auto;
    background:#ffffff;
    border-radius:10px;
    overflow:hidden;
    border:1px solid #e1e5ea;
  ">

    <!-- =====================================================
         HEADER
         ===================================================== -->

    <div style="
      padding:22px 24px;
      background:#172033;
      color:#ffffff;
    ">

      <h2 style="
        margin:0;
        font-size:22px;
        color:${alarmColor};
      ">
        ${escapeHtml(title)}
      </h2>

      <p style="
        margin:8px 0 0;
        opacity:.85;
      ">
        TSI SMART PRODUCTS
      </p>

    </div>


    <!-- =====================================================
         CONTENT
         ===================================================== -->

    <div style="
      padding:24px;
      line-height:1.6;
    ">

      <!-- Alarm explanation -->

      <p>
        ${intro}
      </p>


      <!-- ===================================================
           INSPECTION INFORMATION TABLE
           =================================================== -->

      <table
        cellpadding="10"
        cellspacing="0"
        style="
          border-collapse:collapse;
          width:100%;
          border:1px solid #dfe3e8;
          margin:20px 0;
        "
      >

        <!-- Gas -->

        <tr>

          <td style="
            border:1px solid #dfe3e8;
          ">
            <strong>
              Gas
            </strong>
          </td>

          <td style="
            border:1px solid #dfe3e8;
          ">
            ${escapeHtml(
              row.gas_type,
            )}
          </td>

        </tr>


        <!-- Current Pressure -->

        <tr>

          <td style="
            border:1px solid #dfe3e8;
          ">
            <strong>
              Current Pressure
            </strong>
          </td>

          <td style="
            border:1px solid #dfe3e8;
          ">
            <strong>
              ${escapeHtml(
                row.pressure,
              )}
              ${escapeHtml(
                row.pressure_unit,
              )}
            </strong>
          </td>

        </tr>


        <!-- Refill Threshold -->

        ${refillThresholdRow}


        <!-- Critical Threshold -->

        ${criticalThresholdRow}


        <!-- Status -->

        <tr>

          <td style="
            border:1px solid #dfe3e8;
          ">
            <strong>
              Status
            </strong>
          </td>

          <td style="
            border:1px solid #dfe3e8;
          ">
            <strong>
              ${escapeHtml(
                statusText,
              )}
            </strong>
          </td>

        </tr>


        <!-- Checked By -->

        <tr>

          <td style="
            border:1px solid #dfe3e8;
          ">
            <strong>
              Checked By
            </strong>
          </td>

          <td style="
            border:1px solid #dfe3e8;
          ">
            ${escapeHtml(
              row.inspector_name,
            )}
          </td>

        </tr>


        <!-- Inspection Time -->

        <tr>

          <td style="
            border:1px solid #dfe3e8;
          ">
            <strong>
              Inspection Time
            </strong>
          </td>

          <td style="
            border:1px solid #dfe3e8;
          ">
            ${escapeHtml(
              formatJakartaDateTime(
                row.inspection_date,
              ),
            )}
          </td>

        </tr>


        <!-- In Quantity -->

        <tr>

          <td style="
            border:1px solid #dfe3e8;
          ">
            <strong>
              In Quantity
            </strong>
          </td>

          <td style="
            border:1px solid #dfe3e8;
          ">
            ${escapeHtml(
              row.in_kgs ?? 0,
            )} KGS
          </td>

        </tr>


        <!-- Remarks -->

        <tr>

          <td style="
            border:1px solid #dfe3e8;
          ">
            <strong>
              Remarks
            </strong>
          </td>

          <td style="
            border:1px solid #dfe3e8;
          ">
            ${escapeHtml(
              row.notes || '-',
            )}
          </td>

        </tr>

      </table>


      <!-- ===================================================
           ACTION
           =================================================== -->

      <p>
        <strong>
          ${escapeHtml(
            actionText,
          )}
        </strong>
      </p>


      <!-- ===================================================
           SYSTEM ACCESS
           =================================================== -->

      ${systemAccess}


      <!-- ===================================================
           DAILY REMINDER INFORMATION
           =================================================== -->

      <p>
        This reminder will be sent again every day at
        <strong>
          10:00 WIB
        </strong>
        while the threshold condition
        remains active and no refill has occurred.
      </p>


      <!-- ===================================================
           FOOTER SEPARATOR
           =================================================== -->

      <hr style="
        border:0;
        border-top:1px solid #e1e5ea;
        margin:25px 0;
      ">


      <!-- ===================================================
           FOOTER
           =================================================== -->

      <p style="
        margin:0;
        color:#687386;
        font-size:12px;
      ">
        TSI SMART PRODUCTS<br>
        Gas Tank Monitoring System
      </p>

    </div>

  </div>

</body>

</html>
`

  return {
    subject,
    html,
  }
}

/* ============================================================
 * DUPLICATE CHECK
 * ============================================================
 */

async function hasReminderBeenSent(
  gasType: GasType,
  reminderDate: string,
): Promise<boolean> {
  const { data, error } =
    await supabaseAdmin
      .from('gas_email_reminder_logs')
      .select('id')
      .eq(
        'gas_type',
        gasType,
      )
      .eq(
        'reminder_date',
        reminderDate,
      )
      .eq(
        'recipient_email',
        REMINDER_RECIPIENT,
      )
      .limit(1)

  if (error) {
    throw new Error(
      `Failed to check reminder log: ${error.message}`,
    )
  }

  return Boolean(
    data &&
    data.length > 0,
  )
}

/* ============================================================
 * MAIN
 * ============================================================
 */

Deno.serve(
  async (req) => {
    if (req.method !== 'POST') {
      return Response.json(
        {
          ok: false,
          error:
            'Method not allowed. Use POST.',
        },
        {
          status: 405,
        },
      )
    }

    const providedKey =
      req.headers.get(
        'apikey',
      ) ?? ''

    if (
      !providedKey ||
      providedKey !==
        SUPABASE_SECRET_KEY
    ) {
      return Response.json(
        {
          ok: false,
          error:
            'Unauthorized.',
        },
        {
          status: 401,
        },
      )
    }

    try {
      const reminderDate =
        getJakartaDate()

      const [
        inspections,
        settings,
      ] = await Promise.all([
        getInspectionHistory(),
        getSettings(),
      ])

      const activeCycles =
        getActiveCycles(
          inspections,
        )

      const results: Array<
        Record<string, unknown>
      > = []

      for (
        const cycle of activeCycles
      ) {
        const row =
          cycle.latestInspection

        if (isRefill(row)) {
          results.push({
            gas_type:
              cycle.gasType,
            action:
              'skip_refill',
            inspection_id:
              row.id,
            pressure:
              row.pressure,
            pressure_unit:
              row.pressure_unit,
            in_kgs:
              row.in_kgs,
          })

          continue
        }

        const setting =
          settings.find(
            (item) =>
              item.gas_type ===
                row.gas_type &&
              item.pressure_unit ===
                row.pressure_unit,
          )

        if (!setting) {
          results.push({
            gas_type:
              cycle.gasType,
            action:
              'skip_no_setting',
            pressure_unit:
              row.pressure_unit,
            inspection_id:
              row.id,
          })

          continue
        }

        const refillThreshold =
          setting.refill_threshold ===
          null
            ? null
            : Number(
                setting.refill_threshold,
              )

        const criticalThreshold =
          setting.critical_threshold ===
          null
            ? null
            : Number(
                setting.critical_threshold,
              )

        if (
          refillThreshold ===
            null ||
          criticalThreshold ===
            null
        ) {
          results.push({
            gas_type:
              cycle.gasType,
            action:
              'skip_unconfigured',
            inspection_id:
              row.id,
            pressure_unit:
              row.pressure_unit,
          })

          continue
        }

        if (
          criticalThreshold >
          refillThreshold
        ) {
          results.push({
            gas_type:
              cycle.gasType,
            action:
              'skip_invalid_threshold',
            refill_threshold:
              refillThreshold,
            critical_threshold:
              criticalThreshold,
          })

          continue
        }

        const severity =
          getSeverity(
            Number(row.pressure),
            refillThreshold,
            criticalThreshold,
          )

        if (!severity) {
          results.push({
            gas_type:
              cycle.gasType,
            action:
              'skip_normal',
            inspection_id:
              row.id,
            pressure:
              row.pressure,
            pressure_unit:
              row.pressure_unit,
          })

          continue
        }

        const alreadySent =
          await hasReminderBeenSent(
            cycle.gasType,
            reminderDate,
          )

        if (alreadySent) {
          results.push({
            gas_type:
              cycle.gasType,
            action:
              'skip_already_sent_today',
            severity,
            inspection_id:
              row.id,
            reminder_date:
              reminderDate,
          })

          continue
        }

        const email =
          buildEmail(
            row,
            refillThreshold,
            criticalThreshold,
            severity,
          )

        const {
          data: sent,
          error: sendError,
        } =
          await resend.emails.send(
            {
              from: EMAIL_FROM,
              to:
                REMINDER_RECIPIENTS,
              subject:
                email.subject,
              html:
                email.html,
            },
          )

        if (sendError) {
          throw new Error(
            `Resend error for ${row.gas_type}: ${sendError.message}`,
          )
        }

        const {
          error: logError,
        } =
          await supabaseAdmin
            .from(
              'gas_email_reminder_logs',
            )
            .insert({
              inspection_id:
                row.id,
              gas_type:
                row.gas_type,
              reminder_date:
                reminderDate,
              severity,
              recipient_email:
                REMINDER_RECIPIENT,
              provider_message_id:
                sent?.id ?? null,
            })

        if (
          logError &&
          logError.code !==
            '23505'
        ) {
          throw new Error(
            `Failed to save reminder log: ${logError.message}`,
          )
        }

        results.push({
          gas_type:
            cycle.gasType,
          action: logError
            ? 'sent_but_duplicate_log'
            : 'sent',
          severity,
          inspection_id:
            row.id,
          pressure:
            row.pressure,
          pressure_unit:
            row.pressure_unit,
          message_id:
            sent?.id ?? null,
          reminder_date:
            reminderDate,
        })
      }

      return Response.json({
        ok: true,
        reminder_date:
          reminderDate,
        recipient:
          REMINDER_RECIPIENTS,
        processed_gases:
          activeCycles.length,
        results,
      })
    } catch (error) {
      console.error(
        'Daily gas reminder error:',
        error,
      )

      return Response.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Unknown error',
        },
        {
          status: 500,
        },
      )
    }
  },
)
