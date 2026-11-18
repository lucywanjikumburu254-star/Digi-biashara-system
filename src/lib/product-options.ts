export const PRODUCT_CATEGORIES = [
  "General Goods",
  "Food & Groceries",
  "Beverages",
  "Fruits & Vegetables",
  "Meat, Fish & Poultry",
  "Dairy & Eggs",
  "Bakery & Confectionery",
  "Cereals & Grains",
  "Household Goods",
  "Cleaning & Hygiene Products",
  "Beauty & Cosmetics",
  "Clothing & Apparel",
  "Footwear",
  "Jewellery & Accessories",
  "Electronics",
  "Phones & Accessories",
  "Computers & IT Equipment",
  "Furniture & Home Décor",
  "Building Materials",
  "Hardware & Tools",
  "Electrical Supplies",
  "Plumbing Supplies",
  "Automotive & Spare Parts",
  "Motorcycle & Bicycle Parts",
  "Agricultural Supplies",
  "Animal Feed & Pet Supplies",
  "Medical & Health Supplies",
  "Stationery & Office Supplies",
  "Books & Educational Materials",
  "Packaging & Disposables",
  "Gas & Fuel",
  "Sports & Outdoor Equipment",
  "Toys & Baby Products",
  "Industrial Supplies",
  "Services & Labour",
  "Other"
] as const;

export const PRODUCT_UNITS = [
  { value: "piece", label: "Piece" },
  { value: "pair", label: "Pair" },
  { value: "set", label: "Set" },
  { value: "dozen", label: "Dozen" },
  { value: "pack", label: "Pack" },
  { value: "packet", label: "Packet" },
  { value: "box", label: "Box" },
  { value: "carton", label: "Carton" },
  { value: "bottle", label: "Bottle" },
  { value: "can", label: "Can" },
  { value: "tin", label: "Tin" },
  { value: "jar", label: "Jar" },
  { value: "sachet", label: "Sachet" },
  { value: "bag", label: "Bag" },
  { value: "sack", label: "Sack" },
  { value: "crate", label: "Crate" },
  { value: "tray", label: "Tray" },
  { value: "bundle", label: "Bundle" },
  { value: "roll", label: "Roll" },
  { value: "sheet", label: "Sheet" },
  { value: "kg", label: "Kilogram (kg)" },
  { value: "gram", label: "Gram (g)" },
  { value: "tonne", label: "Tonne" },
  { value: "litre", label: "Litre (L)" },
  { value: "ml", label: "Millilitre (ml)" },
  { value: "metre", label: "Metre (m)" },
  { value: "cm", label: "Centimetre (cm)" },
  { value: "mm", label: "Millimetre (mm)" },
  { value: "foot", label: "Foot (ft)" },
  { value: "inch", label: "Inch (in)" },
  { value: "sqm", label: "Square metre (m²)" },
  { value: "hour", label: "Hour" },
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "service", label: "Service" },
  { value: "trip", label: "Trip" },
  { value: "job", label: "Job" }
] as const;

export function optionsWithLegacy<T extends { value: string; label: string }>(
  options: readonly T[],
  currentValue: string
): { value: string; label: string }[] {
  if (!currentValue || options.some(option => option.value === currentValue)) {
    return options.map(option => ({ value: option.value, label: option.label }));
  }
  return [
    { value: currentValue, label: currentValue + " (previously saved)" },
    ...options.map(option => ({ value: option.value, label: option.label }))
  ];
}

export const CATEGORY_OPTIONS = PRODUCT_CATEGORIES.map(value => ({ value, label: value }));
