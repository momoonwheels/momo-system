import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
import { createServerClient, getConfig, getRecipeMap } from '@/lib/supabase'
import { calcPackageNeeds, calcIngredientNeeds } from '@/lib/calculations'

const MENU_LABELS: Record<string,string> = {
  REG: 'Regular Mo:Mo', FRI: 'Fried Mo:Mo', CHI: 'Chilli Mo:Mo',
  JHO: 'Jhol Mo:Mo', CW: 'Chowmein'
}

// Packages per 10 orders per menu item
const PKG_PER_10: Record<string, Record<string,number>> = {
  REG: { 'FM-1':1 },
  FRI: { 'FM-1':1 },
  CHI: { 'FM-1':1, 'CM-1':1, 'CM-2':1 },
  JHO: { 'FM-1':1, 'JM-1':1, 'JM-3':1, 'JM-4':1, 'JM-5':1 },
  CW:  { 'CH-1':1, 'CH-3':1, 'CH-4':1, 'CH-5':1, 'CH-6':1, 'CH-7':1 },
}

export async function GET(req: NextRequest) {
  const sb = createServerClient()
  const { searchParams } = new URL(req.url)
  const weekStart = searchParams.get('week_start')
  const locationId = searchParams.get('location_id') // optional, null = combined

  if (!weekStart) return NextResponse.json({ error: 'week_start required' }, { status: 400 })

  // Get week end date
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekEndStr = weekEnd.toISOString().split('T')[0]

  // Get all food truck locations
  const { data: locations } = await sb.from('locations').select('*').eq('type','food_truck').eq('active',true)
  const targetLocations = locationId
    ? (locations||[]).filter(l => l.id === locationId)
    : (locations||[])

  // ── 1. PLANNED ORDERS ─────────────────────────────────────────────
  const { data: menuItems } = await sb.from('menu_items').select('*')
  const menuMap: Record<string,any> = {}
  for (const m of menuItems||[]) menuMap[m.id] = m

  const plannedByMenu: Record<string,number> = { REG:0, FRI:0, CHI:0, JHO:0, CW:0 }
  const plannedByLocation: Record<string, Record<string,number>> = {}

  for (const loc of targetLocations) {
    const { data: orders } = await sb.from('planned_orders')
      .select('*, menu_items(code)')
      .eq('location_id', loc.id)
      .gte / .lte

    plannedByLocation[loc.id] = { REG:0, FRI:0, CHI:0, JHO:0, CW:0 }
    const days = ['mon','tue','wed','thu','fri','sat','sun']
    for (const row of orders||[]) {
      const code = (row.menu_items as any)?.code as string
      if (!code) continue
      const total = days.reduce((s,d) => s + (Number(row[d])||0), 0)
      plannedByMenu[code] = (plannedByMenu[code]||0) + total
      plannedByLocation[loc.id][code] = (plannedByLocation[loc.id][code]||0) + total
    }
  }

  // ── 2. ACTUAL SALES FROM SQUARE ───────────────────────────────────
  const TOKEN = process.env.SQUARE_ACCESS_TOKEN
  const actualByMenu: Record<string,number> = { REG:0, FRI:0, CHI:0, JHO:0, CW:0 }
  let totalRevenue = 0
  let totalRefunds = 0
  let orderCount = 0

  if (TOKEN) {
    const { data: sqLocations } = await sb.from('square_locations').select('*')
    for (const loc of targetLocations) {
      const sqLoc = sqLocations?.find(s => s.app_location_id === loc.id)
      if (!sqLoc) continue
      try {
        const res = await fetch('https://connect.squareup.com/v2/orders/search', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'Square-Version': '2024-01-18' },
          body: JSON.stringify({
            location_ids: [sqLoc.square_location_id],
            query: {
              filter: {
                date_time_filter: { created_at: { start_at: `${weekStart}T00:00:00Z`, end_at: `${weekEndStr}T23:59:59Z` } },
                state_filter: { states: ['COMPLETED'] }
              }
            },
            limit: 500
          })
        })
        const data = await res.json()
        for (const order of data.orders||[]) {
          totalRevenue += (order.total_money?.amount||0) / 100
          totalRefunds += (order.refunds?.reduce((s:number,r:any) => s+(r.amount_money?.amount||0), 0)||0) / 100
          orderCount++
          // Match line items to menu codes
          for (const item of order.line_items||[]) {
            const name = (item.name||'').toLowerCase()
            if (name.includes('regular') || name.includes('steamed') || name.includes('steam')) actualByMenu.REG += Number(item.quantity)||1
            else if (name.includes('fried')) actualByMenu.FRI += Number(item.quantity)||1
            else if (name.includes('chilli') || name.includes('chili')) actualByMenu.CHI += Number(item.quantity)||1
            else if (name.includes('jhol')) actualByMenu.JHO += Number(item.quantity)||1
            else if (name.includes('chow') || name.includes('noodle')) actualByMenu.CW += Number(item.quantity)||1
          }
        }
      } catch(e) { console.error('Square error:', e) }
    }
  }

  const netRevenue = totalRevenue - totalRefunds

  // ── 3. SALES VARIANCE ─────────────────────────────────────────────
  const salesVariance = Object.keys(plannedByMenu).map(code => {
    const planned = plannedByMenu[code] || 0
    const actual = actualByMenu[code] || 0
    const variance = actual - planned
    const variancePct = planned > 0 ? (variance / planned * 100) : 0
    return { code, label: MENU_LABELS[code], planned, actual, variance, variancePct }
  })

  // ── 4. PACKAGE VARIANCE ────────────────────────────────────────────
  // Packages used = actual sales / 10 per package type
  const packagesUsed: Record<string,number> = {}
  for (const [menuCode, pkgMap] of Object.entries(PKG_PER_10)) {
    const orders = actualByMenu[menuCode] || 0
    for (const [pkgCode, perTen] of Object.entries(pkgMap)) {
      packagesUsed[pkgCode] = (packagesUsed[pkgCode]||0) + Math.ceil(orders / 10 * perTen)
    }
  }

  // Packages sent = sum of delivery log entries for the week
  const { data: deliveryLogs } = await sb.from('truck_inventory_log')
    .select('package_id, quantity, packages(code)')
    .eq('log_type', 'delivery')
    .gte('log_date', weekStart)
    .lte('log_date', weekEndStr)

  const packagesSent: Record<string,number> = {}
  for (const log of deliveryLogs||[]) {
    const code = (log.packages as any)?.code
    if (code) packagesSent[code] = (packagesSent[code]||0) + Number(log.quantity)
  }

  // Get all packages for display
  const { data: packages } = await sb.from('packages').select('code,name,containers(code)').order('sort_order')
  const packageVariance = (packages||[]).map((pkg:any) => {
    const sent = packagesSent[pkg.code] || 0
    const used = packagesUsed[pkg.code] || 0
    const leftover = sent - used
    const variancePct = sent > 0 ? (leftover / sent * 100) : 0
    return { code: pkg.code, name: pkg.name, container: pkg.containers?.code, sent, used, leftover, variancePct }
  }).filter((p:any) => p.sent > 0 || p.used > 0)

  // ── 5. COST PER PACKAGE ────────────────────────────────────────────
  const [cfg, recipeMap] = await Promise.all([getConfig(), getRecipeMap()])
  const { data: ingredients } = await sb.from('ingredients')
    .select('id,code,name,recipe_unit,conv_factor,current_unit_cost,cost_per_recipe_unit')

  const ingCostMap: Record<string,number> = {}
  for (const ing of ingredients||[]) {
    ingCostMap[ing.code] = Number(ing.cost_per_recipe_unit) || 0
  }

  // Cost per package = recipe ingredients × cost per unit
  const costPerPackage: Record<string,number> = {}
  for (const [menuCode, pkgMap] of Object.entries(PKG_PER_10)) {
    // For 10 orders, calculate ingredient cost
    const tenOrders = { REG:0, FRI:0, CHI:0, JHO:0, CW:0 }
    tenOrders[menuCode as keyof typeof tenOrders] = 10
    const needs = calcIngredientNeeds(tenOrders, cfg, recipeMap)
    let totalCost = 0
    for (const [code, qty] of Object.entries(needs)) {
      totalCost += qty * (ingCostMap[code] || 0)
    }
    for (const pkgCode of Object.keys(pkgMap)) {
      costPerPackage[pkgCode] = (costPerPackage[pkgCode]||0) + totalCost / 10 // cost per order
    }
  }

  // ── 6. FOOD COST VARIANCE ─────────────────────────────────────────
  // Theoretical: recipe × actual sales × ingredient cost
  const actualOrders = { REG: actualByMenu.REG, FRI: actualByMenu.FRI, CHI: actualByMenu.CHI, JHO: actualByMenu.JHO, CW: actualByMenu.CW }
  const ingredientNeeds = calcIngredientNeeds(actualOrders, cfg, recipeMap)
  let theoreticalFoodCost = 0
  for (const [code, qty] of Object.entries(ingredientNeeds)) {
    theoreticalFoodCost += qty * (ingCostMap[code] || 0)
  }

  // Actual: from confirmed receipts this week
  const { data: receiptLines } = await sb.from('receipt_line_items')
    .select('total_price, receipts!inner(receipt_date, status)')
    .eq('status', 'confirmed')
    .gte('receipts.receipt_date', weekStart)
    .lte('receipts.receipt_date', weekEndStr)
  const actualFoodCost = receiptLines?.reduce((s:number,l:any) => s+(Number(l.total_price)||0), 0) || 0

  // ── 7. EXPENSES ───────────────────────────────────────────────────
  const { data: expenses } = await sb.from('manual_expenses')
    .select('*').gte('expense_date', weekStart).lte('expense_date', weekEndStr)
  const totalExpenses = expenses?.reduce((s:number,e:any) => s+(Number(e.amount)||0), 0) || 0

  // Labor from Square (shifts)
  let laborCost = 0
  if (TOKEN) {
    try {
      const res = await fetch(`https://connect.squareup.com/v2/labor/shifts?start_at=${weekStart}T00:00:00Z&end_at=${weekEndStr}T23:59:59Z&limit=200`, {
        headers: { 'Authorization': `Bearer ${TOKEN}`, 'Square-Version': '2024-01-18' }
      })
      const data = await res.json()
      for (const shift of data.shifts||[]) {
        laborCost += (shift.wage?.total_pay_money?.amount||0) / 100
      }
    } catch(e) {}
  }

  // ── FINAL RESPONSE ────────────────────────────────────────────────
  return NextResponse.json({
    weekStart, weekEnd: weekEndStr,
    locations: targetLocations,
    plannedByMenu, actualByMenu, salesVariance,
    packageVariance, costPerPackage,
    foodCost: { theoretical: theoreticalFoodCost, actual: actualFoodCost, variance: actualFoodCost - theoreticalFoodCost },
    pnl: {
      revenue: netRevenue, grossRevenue: totalRevenue, refunds: totalRefunds,
      foodCost: actualFoodCost, laborCost, otherExpenses: totalExpenses,
      grossProfit: netRevenue - actualFoodCost,
      netProfit: netRevenue - actualFoodCost - laborCost - totalExpenses
    },
    orderCount
  })
}
