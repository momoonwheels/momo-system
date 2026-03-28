-- ============================================================
-- MOMO ON THE WHEELS — Complete Database Schema
-- Run this entire file in Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── LOCATIONS ─────────────────────────────────────────────
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('newport','food_truck')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── CONFIG ────────────────────────────────────────────────
CREATE TABLE config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT,
  notes TEXT,
  sort_order INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── MENU ITEMS ────────────────────────────────────────────
CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  active BOOLEAN DEFAULT true
);

-- ── CONTAINERS ────────────────────────────────────────────
CREATE TABLE containers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INT DEFAULT 0
);

-- ── PACKAGES ──────────────────────────────────────────────
CREATE TABLE packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  contents TEXT,
  container_id UUID REFERENCES containers(id),
  size_qty NUMERIC,
  size_unit TEXT,
  is_fixed BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  active BOOLEAN DEFAULT true
);

-- ── INGREDIENTS ───────────────────────────────────────────
CREATE TABLE ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  vendor_unit_desc TEXT,
  recipe_unit TEXT NOT NULL,
  conv_factor NUMERIC NOT NULL DEFAULT 1,
  min_order_qty NUMERIC NOT NULL DEFAULT 1,
  storage_type TEXT,
  is_overhead BOOLEAN DEFAULT false,
  current_unit_cost NUMERIC DEFAULT 0,
  cost_per_recipe_unit NUMERIC GENERATED ALWAYS AS (
    CASE WHEN conv_factor > 0 THEN current_unit_cost / conv_factor ELSE 0 END
  ) STORED,
  active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── RECIPE ITEMS ──────────────────────────────────────────
CREATE TABLE recipe_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  context TEXT NOT NULL,
  -- contexts: REG, FRI, CHI, JHO, CW, BATCH_FM, BATCH_RA, BATCH_SA, BATCH_JH, BATCH_CW
  qty NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ingredient_id, context)
);

-- ── PLANNED ORDERS ────────────────────────────────────────
CREATE TABLE planned_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id UUID NOT NULL REFERENCES locations(id),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  week_start DATE NOT NULL,
  mon NUMERIC DEFAULT 0,
  tue NUMERIC DEFAULT 0,
  wed NUMERIC DEFAULT 0,
  thu NUMERIC DEFAULT 0,
  fri NUMERIC DEFAULT 0,
  sat NUMERIC DEFAULT 0,
  sun NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(location_id, menu_item_id, week_start)
);

-- ── TRUCK INVENTORY ───────────────────────────────────────
CREATE TABLE truck_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id UUID NOT NULL REFERENCES locations(id),
  package_id UUID NOT NULL REFERENCES packages(id),
  quantity NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT,
  UNIQUE(location_id, package_id)
);

-- ── NEWPORT INVENTORY ─────────────────────────────────────
CREATE TABLE newport_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity_on_hand NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ingredient_id)
);

-- ── RECEIPTS ──────────────────────────────────────────────
CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_name TEXT,
  receipt_date DATE,
  total_amount NUMERIC,
  image_url TEXT,
  raw_ocr_text TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','reviewing','confirmed','rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── RECEIPT LINE ITEMS ────────────────────────────────────
CREATE TABLE receipt_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  raw_text TEXT,
  matched_ingredient_id UUID REFERENCES ingredients(id),
  match_confidence NUMERIC CHECK (match_confidence BETWEEN 0 AND 1),
  quantity NUMERIC,
  unit TEXT,
  unit_price NUMERIC,
  total_price NUMERIC,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected','manual')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── COGS LOG ─────────────────────────────────────────────
CREATE TABLE cogs_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id),
  receipt_id UUID REFERENCES receipts(id),
  recorded_at TIMESTAMPTZ DEFAULT now(),
  unit_price NUMERIC NOT NULL,
  cost_per_recipe_unit NUMERIC NOT NULL,
  notes TEXT
);

-- ── PACKAGE COGS ─────────────────────────────────────────
-- Computed snapshot: cost per package and per menu item
CREATE TABLE package_cogs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  computed_at TIMESTAMPTZ DEFAULT now(),
  context TEXT NOT NULL,
  label TEXT NOT NULL,
  total_cost NUMERIC NOT NULL,
  cost_per_order NUMERIC,
  cost_per_batch NUMERIC,
  breakdown JSONB
);

-- ── TRIGGERS ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_planned_orders    BEFORE UPDATE ON planned_orders    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_truck_inventory   BEFORE UPDATE ON truck_inventory   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_newport_inventory BEFORE UPDATE ON newport_inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_config            BEFORE UPDATE ON config            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_recipe_items      BEFORE UPDATE ON recipe_items      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ingredients       BEFORE UPDATE ON ingredients       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_receipts          BEFORE UPDATE ON receipts          FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS POLICIES (open for now, restrict after auth is added) ──
ALTER TABLE locations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE config            ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE containers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_inventory   ENABLE ROW LEVEL SECURITY;
ALTER TABLE newport_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cogs_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_cogs      ENABLE ROW LEVEL SECURITY;

-- Open policies (replace with role-based after auth)
DO $$ DECLARE t TEXT;
BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
  EXECUTE format('CREATE POLICY "allow_all_%s" ON %I FOR ALL USING (true) WITH CHECK (true)', t, t);
END LOOP; END $$;

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO locations (name, type) VALUES
  ('Newport (Production)', 'newport'),
  ('Lincoln City Food Truck', 'food_truck'),
  ('Salem Food Truck', 'food_truck');

INSERT INTO menu_items (code, name, sort_order) VALUES
  ('REG','Regular Mo:Mo',1),('FRI','Fried Mo:Mo',2),
  ('CHI','Chilli Mo:Mo',3),('JHO','Jhol Mo:Mo',4),('CW','Chowmein',5);

INSERT INTO config (group_name,key,label,value,unit,notes,sort_order) VALUES
  ('batch_sizes','BATCH_FM','Frozen Momo Batch Size',800,'pieces','Update when confirmed',1),
  ('batch_sizes','BATCH_RA','Regular Achar Batch Size',40,'orders/batch','',2),
  ('batch_sizes','BATCH_SA','Spicy Achar Batch Size',40,'orders/batch','',3),
  ('batch_sizes','BATCH_JH','Jhol Soup Batch Size',10,'orders/batch','',4),
  ('batch_sizes','BATCH_CW','CW Chicken Marinade Batch',10,'orders/batch','',5),
  ('serving_sizes','SERV_MM_PCS','Momo pieces per order',10,'pieces','',1),
  ('serving_sizes','SERV_RA_OZ','Regular Achar serving',2,'oz/order','Side cup Reg+Fried; mixed Jhol',2),
  ('serving_sizes','SERV_SA_OZ','Spicy Achar serving',1,'oz/order','Side cup Reg+Fried only',3),
  ('serving_sizes','SERV_JH_OZ','Jhol Soup per order',10,'oz/order','',4),
  ('serving_sizes','SERV_JM3_10','Jhol Mix per 10 orders',4,'oz/10 orders','',5),
  ('serving_sizes','SERV_JM4_15','Lemon per 15 orders',0.5,'lemons','',6),
  ('serving_sizes','SERV_JM5_OZ','Soybean Powder shaker',0.5,'oz','1/4 tsp per order',7),
  ('sauce_buffer','BUF_PCT','Sauce Buffer %',0.05,'','Applied to CM-1 and CH-3',1),
  ('package_sizes','SZ_FM1','FM-1 size',100,'pieces/pkg','',1),
  ('package_sizes','SZ_CM1','CM-1 size',84.5,'oz/bottle','2.5L bottle',2),
  ('package_sizes','SZ_CM2','CM-2 size',80,'oz/bag','5 lb bag',3),
  ('package_sizes','SZ_JM1','JM-1 size',1.5,'lbs/piece','',4),
  ('package_sizes','SZ_JM3','JM-3 size',16,'oz/bag','1 lb bag',5),
  ('package_sizes','SZ_JM4','JM-4 size',2,'lemons/pack','',6),
  ('package_sizes','SZ_JM5','JM-5 size',0.5,'oz/shaker','',7),
  ('package_sizes','SZ_CH1','CH-1 size',80,'oz/bag','5 lb bag',8),
  ('package_sizes','SZ_CH3','CH-3 size',33.8,'oz/bottle','1L bottle',9),
  ('package_sizes','SZ_CH4','CH-4 size',0.5,'oz/shaker','0.5 oz MSG shaker',10),
  ('package_sizes','SZ_CH5','CH-5 size',10,'lbs/box','',11),
  ('package_sizes','SZ_CH6','CH-6 size',80,'oz/bag','5 lb bag',12),
  ('package_sizes','SZ_CH7','CH-7 size',64,'oz/bag','4 lb bag',13),
  ('package_sizes','SZ_ST1B','ST-1 Bowls size',400,'bowls/case','4x100',14),
  ('package_sizes','SZ_ST1A','ST-1 Alum size',500,'sheets/case','',15),
  ('package_sizes','SZ_ST2C','ST-2 Cups size',2500,'cups/case','10x250',16),
  ('package_sizes','SZ_ST2L','ST-2 Lids size',2500,'lids/case','20x125',17),
  ('package_sizes','SZ_ST3F','ST-3 Forks size',1500,'forks/case','3x500',18),
  ('package_sizes','SZ_ST4S','ST-4 Spoons size',1000,'spoons/case','',19),
  ('package_sizes','SZ_ST4J','ST-4 Jhol Bowls size',12,'bowls/case','',20),
  ('package_sizes','SZ_BAG','Brown Bags size',500,'bags/pack','',21),
  ('package_sizes','SZ_NAP','Napkins size',500,'napkins/case','',22),
  ('package_sizes','SZ_WAT','Water size',32,'bottles/unit','',23);

INSERT INTO containers (code,name,description,sort_order) VALUES
  ('FM','FM','Frozen Momo — all momo items',1),
  ('CM','CM','Chilli Momo container',2),
  ('JM','JM','Jhol Momo container',3),
  ('CH','CH','Chowmein container',4),
  ('RA','RA','Regular Achar container',5),
  ('SA','SA','Spicy Achar container',6),
  ('ST','ST','Supplies container',7),
  ('SO','SO','Salt & Oil overhead',8),
  ('CL','CL','Cleaning Supplies monthly',9),
  ('WAT','Water','Water',10);

INSERT INTO packages (code,name,contents,container_id,size_qty,size_unit,sort_order)
SELECT p.code,p.name,p.contents,c.id,p.size_qty,p.size_unit,p.sort_order
FROM (VALUES
  ('FM-1','Frozen Mo:Mo','Frozen Mo:Mo vacuum sealed','FM',100,'pieces/pkg',1),
  ('CM-1','Chilli Sauce','Chilli Sauce bottle','CM',84.5,'oz/bottle',2),
  ('CM-2','Onion+Pepper Cubed','Onion+Green Pepper cubed vacuum','CM',80,'oz/bag',3),
  ('JM-1','Bone-in Chicken','Bone-in Chicken vacuum','JM',1.5,'lbs/piece',4),
  ('JM-3','Jhol Mix','Onion+Scallion+Cilantro vacuum','JM',16,'oz/bag',5),
  ('JM-4','Lemons','Lemons','JM',2,'lemons/pack',6),
  ('JM-5','Soybean Powder Shaker','Soybean Powder 0.5oz shaker','JM',0.5,'oz/shaker',7),
  ('CH-1','Cabbage+Carrots','Cabbage+Carrots vacuum','CH',80,'oz/bag',8),
  ('CH-3','Chow Mein Sauce','Chow Mein Sauce bottle','CH',33.8,'oz/bottle',9),
  ('CH-4','MSG Shaker','MSG 0.5oz shaker','CH',0.5,'oz/shaker',10),
  ('CH-5','Yakisoba Noodles','Yakisoba Noodles box','CH',10,'lbs/box',11),
  ('CH-6','Onion+Pepper Strings','Onion+Green Pepper strings vacuum','CH',80,'oz/bag',12),
  ('CH-7','Chicken Breast','Chicken Breast marinated vacuum','CH',64,'oz/bag',13),
  ('NA_SA-3-RA','Roma Tomatoes (RA)','Roma Tomatoes for Regular Achar','RA',5,'lbs/bag',14),
  ('NA_SA-2-RA','Roasted Garlic (RA)','Roasted Garlic for Regular Achar','RA',6,'oz/container',15),
  ('NA_SA-1-RA','Dry Masala 1 (RA)','Timbur+Kashmiri for Regular Achar','RA',5,'g/bottle',16),
  ('NA-4','Dry Masala 2','Zimbu/Turmeric/Sesame/Methi/Cumin','RA',5,'g/bottle',17),
  ('NA-5','Cilantro (RA)','Cilantro vacuum for Regular Achar','RA',1,'pkg',18),
  ('NA_SA-3-SA','Roma Tomatoes (SA)','Roma Tomatoes for Spicy Achar','SA',5,'lbs/bag',19),
  ('NA_SA-2-SA','Roasted Garlic (SA)','Roasted Garlic for Spicy Achar','SA',6,'oz/container',20),
  ('NA_SA-1-SA','Dry Masala 1 (SA)','Timbur+Kashmiri for Spicy Achar','SA',5,'g/bottle',21),
  ('SA-4','Roasted Red Chilly','Roasted Red Chilly','SA',1,'oz/container',22),
  ('ST-1-BOWLS','Momo Bowls','Momo Bowls','ST',400,'bowls/case',23),
  ('ST-1-ALUM','Aluminum Foil','Aluminum Foil Sheets','ST',500,'sheets/case',24),
  ('ST-2-CUPS','2oz Sauce Cups','2oz Sauce Cups','ST',2500,'cups/case',25),
  ('ST-2-LIDS','2oz Sauce Lids','2oz Sauce Lids','ST',2500,'lids/case',26),
  ('ST-3-FORKS','Forks','Forks','ST',1500,'forks/case',27),
  ('ST-4-SPOONS','Spoons','Spoons','ST',1000,'spoons/case',28),
  ('ST-4-JHOL','Jhol Bowls','Jhol Bowls','ST',12,'bowls/case',29),
  ('ST-BAGS','Brown Bags','Brown Bags to-go','ST',500,'bags/pack',30),
  ('WATER','Water Bottles','Water Bottles','WAT',32,'bottles/unit',31)
) AS p(code,name,contents,cont_code,size_qty,size_unit,sort_order)
JOIN containers c ON c.code = p.cont_code;

INSERT INTO ingredients (code,name,category,vendor_unit_desc,recipe_unit,conv_factor,min_order_qty,storage_type,is_overhead,sort_order) VALUES
  ('CHK-T','Chicken Thighs','Protein','Case = 40 lbs','lbs',40,1,'F-Frozen',false,1),
  ('CHK-B','Chicken Breast','Protein','Case = 40 lbs','lbs',40,1,'F-Frozen',false,2),
  ('CHK-BI','Bone-in Chicken','Protein','Unit = 10 lbs','lbs',10,1,'F-Frozen',false,3),
  ('TOM','Roma Tomatoes','Produce','Case = 25 lbs','lbs',25,1,'D-Dry',false,4),
  ('ONION','Red Onions','Produce','Sack = 25 lbs','lbs',25,1,'D-Dry',false,5),
  ('CAB','Green Cabbage','Produce','Case = 25 lbs','lbs',25,1,'D-Dry',false,6),
  ('GPEP','Green Peppers','Produce','Case = 25 lbs (400 oz)','oz',400,1,'R-Refrig',false,7),
  ('CARR','Carrots','Produce','Packet TBD','oz',16,1,'R-Refrig',false,8),
  ('SCALL','Scallions','Produce','Packet = 2 lbs (32 oz)','oz',32,1,'R-Refrig',false,9),
  ('CIL','Cilantro','Produce','Packet = 1 lb (16 oz)','oz',16,1,'R-Refrig',false,10),
  ('GAR','Garlic','Produce','Packet = 3 lbs (48 oz)','oz',48,1,'R-Refrig',false,11),
  ('GING','Ginger','Produce','Packet = 1.75 lbs','lbs',1.75,1,'D-Dry',false,12),
  ('LEM','Lemon','Produce','TBD','lemons',1,1,'R-Refrig',false,13),
  ('BUT','Butter','Produce','Case = 30 x 1 lb','lbs',1,1,'R-Refrig',false,14),
  ('YAKI','Yakisoba Noodles','Dry Goods','Case = 4 x 5 lbs','lbs',20,1,'R-Refrig',false,15),
  ('FLOUR','Gold Medal Flour','Dry Goods','Bag = 10 lbs','bags',1,2,'D-Dry',false,16),
  ('KETCH','Ketchup','Sauce','Case = 6 x 105 oz (~630 oz)','oz',630,1,'D-Dry',false,17),
  ('THAI','Thai Chilly Sauce','Sauce','Case = 3 x 102 oz','oz',306,1,'D-Dry',false,18),
  ('SAM','Sambal','Sauce','Case = 3 x 136 oz','oz',408,1,'D-Dry',false,19),
  ('DSOY','Dark Soy Sauce','Sauce','Case = 12 x 63.5 oz','oz',762,1,'D-Dry',false,20),
  ('LSOY','Light Soy Sauce','Sauce','Kikkoman 1 gallon (128 oz)','oz',128,1,'D-Dry',false,21),
  ('COIL','Canola Oil','Oil','Container = 35 lbs','lbs',35,1,'D-Dry',false,22),
  ('BOUL','Chicken Bouillon','Overhead','2 lb jar','oz',32,1,'D-Dry',true,23),
  ('SALT','Salt','Spice','Bottle = 1 lb (16 oz)','oz',16,2,'D-Dry',false,24),
  ('MSG','MSG','Spice','Packet = 3 lbs — 0.5oz shaker for truck','oz',48,1,'D-Dry',false,25),
  ('MOMM','Momo Masala','Spice','Packet = 100g (3.5 oz)','oz',3.5,2,'D-Dry',false,26),
  ('EVRM','Everest Masala','Spice','Packet = 100g (3.5 oz)','oz',3.5,2,'D-Dry',false,27),
  ('TIMB','Timbur','Spice','Packet = 1.75 oz','oz',1.75,2,'D-Dry',false,28),
  ('ZIMB','Zimbu','Spice','Packet = 1.75 oz','oz',1.75,2,'D-Dry',false,29),
  ('TURM','Turmeric','Spice','Bottle = 7 oz','oz',7,2,'D-Dry',false,30),
  ('SES','Sesame Powder','Spice','Bag = 2 lbs (32 oz)','oz',32,1,'D-Dry',false,31),
  ('METH','Methi (Fenugreek)','Spice','Packet = 200g (7 oz)','oz',7,2,'D-Dry',false,32),
  ('SOYP','Soybean Powder','Spice','Packet = 200g (7 oz)','oz',7,1,'D-Dry',false,33),
  ('RCHIL','Roasted Red Chilly','Spice','Packet = 1 lb (16 oz)','oz',16,1,'D-Dry',false,34),
  ('KASH','Kashmiri Chili','Spice','Packet = 7 oz','oz',7,2,'D-Dry',false,35),
  ('CUMIN','Cumin Coriander Pwd','Spice','Packet = 7 oz','oz',7,2,'D-Dry',false,36),
  ('OILSP','Oil Spray','Pantry','Can = 17 oz','cans',1,2,'D-Dry',false,37),
  ('MOB','Momo Bowls','Supplies','Case = 4 x 100 = 400','bowls',400,1,'D-Dry',false,38),
  ('ALUM','Aluminum Foil','Supplies','Case = 500 sheets','sheets',500,1,'D-Dry',false,39),
  ('CUP','2oz Sauce Cups','Supplies','Case = 2500 cups','cups',2500,1,'D-Dry',false,40),
  ('LID','2oz Sauce Lids','Supplies','Case = 2500 lids','lids',2500,1,'D-Dry',false,41),
  ('FORK','Forks','Supplies','Case = 1500 forks','forks',1500,1,'D-Dry',false,42),
  ('SPOON','Spoons','Supplies','Case = 1000 spoons','spoons',1000,1,'D-Dry',false,43),
  ('JHBWL','Jhol Bowls','Supplies','Case = 12','bowls',12,1,'D-Dry',false,44),
  ('JHBLD','Jhol Soup Lids','Supplies','Case = 12','lids',12,1,'D-Dry',false,45),
  ('BAG','Brown Bags','Supplies','Pack = 500','bags',500,1,'D-Dry',false,46),
  ('NAP','Napkins','Supplies','Case = 500','pcs',500,1,'D-Dry',false,47),
  ('GLOVE','Gloves','Overhead','Box = 100 x 10','boxes',10,1,'D-Dry',true,48),
  ('PTOW','Paper Towels','Overhead','Pack = 6','packs',1,1,'D-Dry',true,49),
  ('TRASH','Trash Bags','Overhead','Case = 100','cases',1,1,'D-Dry',true,50),
  ('TWLS','Towels','Overhead','Pack = 12','packs',1,1,'D-Dry',true,51),
  ('DISH','Dishwashing','Overhead','Case = 4 x 1 gal','cases',1,1,'D-Dry',true,52),
  ('CLORX','Clorex','Overhead','Case = 32 fl oz','btls',1,1,'D-Dry',true,53),
  ('SPON','Sponges/Scrubs','Overhead','Pack = 3','packs',1,1,'D-Dry',true,54),
  ('WFOIL','Wrap Foil','Overhead','Case 12in x 2000ft','rolls',1,1,'D-Dry',true,55),
  ('LIGHT','Lighter','Overhead','Each','each',1,1,'D-Dry',true,56),
  ('WATER','Water Bottles','Overhead','Unit = 32 x 16.9oz','btls',32,1,'D-Dry',true,57);

-- Initialize newport_inventory for all ingredients
INSERT INTO newport_inventory (ingredient_id, quantity_on_hand)
SELECT id, 0 FROM ingredients;

