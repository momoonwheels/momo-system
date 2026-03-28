import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side client (for API routes)
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Helper: get config as key->value map
export async function getConfig(): Promise<Record<string, number>> {
  const { data } = await supabase.from('config').select('key,value')
  return Object.fromEntries((data||[]).map(r => [r.key, Number(r.value)]))
}

// Helper: get recipe map { ingredientCode: { context: qty } }
export async function getRecipeMap(): Promise<Record<string, Record<string, number>>> {
  const { data } = await supabase
    .from('recipe_items')
    .select('qty, context, ingredients(code)')
  const map: Record<string, Record<string, number>> = {}
  for (const row of data||[]) {
    const code = (row.ingredients as any)?.code
    if (!code) continue
    if (!map[code]) map[code] = {}
    map[code][row.context] = Number(row.qty)
  }
  return map
}

// Helper: get weekly orders summed across all menu items for a location+week
export async function getWeeklyOrders(locationId: string, weekStart: string) {
  const { data } = await supabase
    .from('planned_orders')
    .select('*, menu_items(code)')
    .eq('location_id', locationId)
    .eq('week_start', weekStart)
  const orders = { REG:0, FRI:0, CHI:0, JHO:0, CW:0 }
  for (const row of data||[]) {
    const code = (row.menu_items as any)?.code as keyof typeof orders
    if (code) {
      orders[code] = (row.mon||0)+(row.tue||0)+(row.wed||0)+(row.thu||0)+(row.fri||0)+(row.sat||0)+(row.sun||0)
    }
  }
  return orders
}
