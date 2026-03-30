// ============================================================
// MOMO ON THE WHEELS — Core Calculations Engine
// Single source of truth for all math.
// Used by web app and future iPad app via API.
// ============================================================

export interface Config { [key: string]: number }

export interface WeeklyOrders {
  REG: number; FRI: number; CHI: number; JHO: number; CW: number;
}

export interface BatchCounts {
  FM: number; RA: number; SA: number; JH: number; CW: number;
}

export interface PackageNeeds { [packageCode: string]: number }
export interface IngredientNeeds { [ingredientCode: string]: number }

function ceil(v: number) { return Math.ceil(v) }
function get(cfg: Config, key: string, def = 1): number { return cfg[key] ?? def }

export function weeklyTotal(o: { mon:number;tue:number;wed:number;thu:number;fri:number;sat:number;sun:number }): number {
  return (o.mon||0)+(o.tue||0)+(o.wed||0)+(o.thu||0)+(o.fri||0)+(o.sat||0)+(o.sun||0);
}

export function calcBatches(o: WeeklyOrders, cfg: Config): BatchCounts {
  return {
    FM: ceil((o.REG+o.FRI+o.JHO+o.CHI) * get(cfg,'SERV_MM_PCS',10) / get(cfg,'BATCH_FM',800)),
    RA: ceil((o.REG+o.FRI+o.JHO) / get(cfg,'BATCH_RA',40)),
    SA: ceil((o.REG+o.FRI) / get(cfg,'BATCH_SA',40)),
    JH: ceil(o.JHO / get(cfg,'BATCH_JH',10)),
    CW: ceil(o.CW / get(cfg,'BATCH_CW',10)),
  };
}

export function calcPackageNeeds(o: WeeklyOrders, cfg: Config): PackageNeeds {
  const b = calcBatches(o, cfg);
  const buf = 1 + get(cfg,'BUF_PCT',0.05);
  const total = o.REG+o.FRI+o.CHI+o.JHO+o.CW;
  return {
    'FM-1':        ceil((o.REG+o.FRI+o.CHI+o.JHO)*get(cfg,'SERV_MM_PCS',10)/get(cfg,'SZ_FM1',100)),
    'CM-1':        ceil(o.CHI*buf*8/get(cfg,'SZ_CM1',84.5)),
    'CM-2':        ceil(o.CHI*4/get(cfg,'SZ_CM2',80)),
    'JM-1':        ceil(o.JHO/get(cfg,'BATCH_JH',10)),
    'JM-3':        ceil(o.JHO*get(cfg,'SERV_JM3_10',4)/10/get(cfg,'SZ_JM3',16)),
    'JM-4':        ceil(o.JHO*get(cfg,'SERV_JM4_15',0.5)/15/get(cfg,'SZ_JM4',2)),
    'JM-5':        ceil(o.JHO*0.25*0.17/get(cfg,'SZ_JM5',0.5)),
    'CH-1':        ceil(o.CW*2.5/get(cfg,'SZ_CH1',80)),
    'CH-2': 2,  // always send 2 bottles, fixed quantity
    'CH-3':        ceil(o.CW*buf/get(cfg,'SZ_CH3',33.8)),
    'CH-4':        ceil(o.CW*0.17/get(cfg,'SZ_CH4',0.5)),
    'CH-5':        ceil(o.CW/get(cfg,'SZ_CH5',10)),
    'CH-6':        ceil(o.CW*1/get(cfg,'SZ_CH6',80)),
    'CH-7':        ceil(o.CW*6/get(cfg,'SZ_CH7',64)),
    'CH-8':        ceil(o.CW*1/get(cfg,'SZ_CH6',80)),
    'NA_SA-3-RA':  b.RA,
    'NA_SA-2-RA':  ceil(b.RA*2/6),
    'NA_SA-1-RA':  ceil(b.RA*2.5/5),
    'NA-4':        ceil(b.RA*21/5),
    'NA-5':        b.RA,
    'NA_SA-3-SA':  b.SA,
    'NA_SA-2-SA':  ceil(b.SA*3.5/6),
    'NA_SA-1-SA':  ceil(b.SA*2.75/5),
    'SA-4':        ceil(b.SA),
    'ST-1-BOWLS':  ceil(total/get(cfg,'SZ_ST1B',400)),
    'ST-1-ALUM':   ceil(total/get(cfg,'SZ_ST1A',500)),
    'ST-2-CUPS':   ceil((o.REG+o.FRI)*2/get(cfg,'SZ_ST2C',2500)),
    'ST-2-LIDS':   ceil((o.REG+o.FRI)*2/get(cfg,'SZ_ST2L',2500)),
    'ST-3-FORKS':  ceil((o.REG+o.FRI+o.CHI+o.CW)/get(cfg,'SZ_ST3F',1500)),
    'ST-4-SPOONS': ceil(o.JHO/get(cfg,'SZ_ST4S',1000)),
    'ST-4-JHOL':   ceil(o.JHO/get(cfg,'SZ_ST4J',12)),
    'ST-BAGS':     ceil(total/get(cfg,'SZ_BAG',500)),
    'WATER':       ceil(total/get(cfg,'SZ_WAT',32)),
  };
}

export function calcPackagesToSend(needed: PackageNeeds, onTruck: {[k:string]:number}): PackageNeeds {
  const r: PackageNeeds = {};
  for (const k in needed) r[k] = Math.max(0, needed[k] - (onTruck[k]||0));
  return r;
}

export function calcIngredientNeeds(
  o: WeeklyOrders, cfg: Config,
  recipeMap: {[ingCode:string]:{[ctx:string]:number}}
): IngredientNeeds {
  const b = calcBatches(o, cfg);
  const buf = 1 + get(cfg,'BUF_PCT',0.05);
  const result: IngredientNeeds = {};
  const mults: {[ctx:string]:number} = {
    REG:o.REG, FRI:o.FRI, CHI:o.CHI, JHO:o.JHO, CW:o.CW,
    BATCH_FM:b.FM, BATCH_RA:b.RA, BATCH_SA:b.SA, BATCH_JH:b.JH, BATCH_CW:b.CW,
  };
  for (const code in recipeMap) {
    let qty = 0;
    for (const ctx in recipeMap[code]) qty += (recipeMap[code][ctx]||0) * (mults[ctx]||0);
    if (qty > 0) result[code] = qty;
  }
  // Apply sauce buffer
  for (const k of ['KETCH','THAI','SAM','DSOY']) if (result[k]) result[k] *= buf;
  return result;
}

export interface OrderLine {
  code: string; needed: number; onHand: number;
  netNeeded: number; convFactor: number; minOrderQty: number; unitsToBuy: number;
}

export function calcOrderLines(
  needs: IngredientNeeds,
  inventoryMap: {[code:string]:number},
  meta: {[code:string]:{convFactor:number;minOrderQty:number}}
): OrderLine[] {
  return Object.entries(needs).map(([code, needed]) => {
    const m = meta[code] || { convFactor:1, minOrderQty:1 };
    const onHand = (inventoryMap[code]||0) * m.convFactor;
    const netNeeded = Math.max(0, needed - onHand);
    const rawUnits = m.convFactor > 0 ? netNeeded / m.convFactor : 0;
    const unitsToBuy = netNeeded > 0
      ? Math.max(m.minOrderQty, Math.ceil(rawUnits/m.minOrderQty)*m.minOrderQty) : 0;
    return { code, needed, onHand, netNeeded, convFactor:m.convFactor, minOrderQty:m.minOrderQty, unitsToBuy };
  });
}

export interface ContextCOGS {
  context: string; label: string;
  ingredients: {code:string;name:string;qtyUsed:number;unit:string;costPerUnit:number;totalCost:number}[];
  totalCost: number; costPerOrder?: number; costPerBatch?: number;
}

export function calcCOGS(
  o: WeeklyOrders, cfg: Config,
  recipeMap: {[code:string]:{[ctx:string]:number}},
  costMap: {[code:string]:number},
  meta: {[code:string]:{name:string;unit:string}}
): ContextCOGS[] {
  const b = calcBatches(o, cfg);
  const contexts = [
    {key:'REG',label:'Regular Mo:Mo',qty:o.REG,isOrder:true},
    {key:'FRI',label:'Fried Mo:Mo',qty:o.FRI,isOrder:true},
    {key:'CHI',label:'Chilli Mo:Mo',qty:o.CHI,isOrder:true},
    {key:'JHO',label:'Jhol Mo:Mo',qty:o.JHO,isOrder:true},
    {key:'CW',label:'Chowmein',qty:o.CW,isOrder:true},
    {key:'BATCH_FM',label:'Frozen Momo Batch',qty:b.FM,isOrder:false},
    {key:'BATCH_RA',label:'Regular Achar Batch',qty:b.RA,isOrder:false},
    {key:'BATCH_SA',label:'Spicy Achar Batch',qty:b.SA,isOrder:false},
    {key:'BATCH_JH',label:'Jhol Soup Batch',qty:b.JH,isOrder:false},
    {key:'BATCH_CW',label:'CW Marinade Batch',qty:b.CW,isOrder:false},
  ];
  return contexts.map(({key,label,qty,isOrder}) => {
    const ingredients = [];
    let total = 0;
    for (const code in recipeMap) {
      const rQty = recipeMap[code][key]||0;
      if (!rQty) continue;
      const used = rQty*qty;
      const cpu = costMap[code]||0;
      const tc = used*cpu;
      total += tc;
      ingredients.push({code,name:meta[code]?.name||code,qtyUsed:used,unit:meta[code]?.unit||'',costPerUnit:cpu,totalCost:tc});
    }
    return {context:key,label,ingredients,totalCost:total,
      costPerOrder:isOrder&&qty>0?total/qty:undefined,
      costPerBatch:!isOrder&&qty>0?total/qty:undefined};
  });
}
