// Klea service catalogue, pricing and checklist templates.
// All prices in GBP. Edit here to change what clients can book.

export const SERVICES = [
  {
    id: 'house-regular',
    name: 'Regular house clean',
    tagline: 'Weekly or fortnightly, same friendly cleaner each visit',
    icon: 'home',
    sized: 'bedrooms',
    recurring: true,
    basePrice: 45, perBedroom: 12, baseMins: 90, minsPerBedroom: 30
  },
  {
    id: 'house-oneoff',
    name: 'One-off house clean',
    tagline: 'A single top-to-bottom clean, no commitment',
    icon: 'sparkle',
    sized: 'bedrooms',
    recurring: false,
    basePrice: 60, perBedroom: 15, baseMins: 120, minsPerBedroom: 35
  },
  {
    id: 'deep-clean',
    name: 'Deep clean',
    tagline: 'Every room, inside cupboards, skirting, the lot',
    icon: 'bubbles',
    sized: 'bedrooms',
    recurring: false,
    basePrice: 110, perBedroom: 30, baseMins: 210, minsPerBedroom: 60
  },
  {
    id: 'airbnb',
    name: 'Airbnb changeover',
    tagline: 'Guest-ready turnaround with linen change and restock',
    icon: 'key',
    sized: 'bedrooms',
    recurring: true,
    basePrice: 40, perBedroom: 14, baseMins: 75, minsPerBedroom: 25
  },
  {
    id: 'end-of-tenancy',
    name: 'End of tenancy clean',
    tagline: 'Deposit-back standard, agent checklist compliant',
    icon: 'box',
    sized: 'bedrooms',
    recurring: false,
    basePrice: 140, perBedroom: 35, baseMins: 240, minsPerBedroom: 60
  },
  {
    id: 'office',
    name: 'Office clean',
    tagline: 'Desks, kitchens, washrooms, bins, out of hours if needed',
    icon: 'briefcase',
    sized: 'sqm',
    recurring: true,
    basePrice: 55, perUnit: 0.35, baseMins: 90, minsPerUnit: 0.6
  },
  {
    id: 'commercial',
    name: 'Commercial property clean',
    tagline: 'Retail, hospitality and communal areas, fully insured',
    icon: 'building',
    sized: 'sqm',
    recurring: true,
    basePrice: 70, perUnit: 0.40, baseMins: 120, minsPerUnit: 0.7
  }
];

// Upsells shown during booking. `for` = which services offer it (empty = all).
export const ADDONS = [
  { id: 'oven', name: 'Oven clean', price: 35, mins: 60, for: [] },
  { id: 'bed-change', name: 'Bed change', price: 8, mins: 12, for: [], perUnit: true, unitLabel: 'beds' },
  { id: 'fridge-freezer', name: 'Fridge and freezer', price: 18, mins: 30, for: [] }
];

// Frequency options and their discount off the per-visit price.
export const FREQUENCIES = [
  { id: 'once', name: 'One-off', discount: 0 },
  { id: 'weekly', name: 'Weekly', discount: 0.15 },
  { id: 'fortnightly', name: 'Fortnightly', discount: 0.10 },
  { id: 'four-weekly', name: 'Every 4 weeks', discount: 0.05 }
];

// Checklist templates keyed by service id (fallback = 'default').
// The Klea Standard, taken from kleahome.co.uk/#/included.
// Every job gets the same list: the standard sections plus the deep clean
// extras. A domestic clean ticks the standard items, a deep clean ticks
// everything, so a Kleaner always knows exactly what is covered.
export const STANDARD_SECTIONS = [
  { section: 'Bedroom', items: [
    'Beds made (not changed, unless bed change add-on selected)',
    'Cushions plumped',
    'Mirrors and glass cleaned',
    'Hoovered everywhere, including skirting boards',
    'Surfaces polished',
    'Bins emptied'
  ] },
  { section: 'Bathroom', items: [
    'Toilet, sink, bath and shower cleaned',
    'Mirrors cleaned',
    'Floor cleaned',
    'Bins emptied'
  ] },
  { section: 'Living room', items: [
    'Cushions plumped',
    'Mirrors and glass cleaned',
    'Surfaces polished',
    'Hoovered everywhere, including skirting boards',
    'Bins emptied'
  ] },
  { section: 'Kitchen', items: [
    'Surfaces cleaned, cupboard fronts wiped',
    'Glass cleaned',
    'Sink scrubbed',
    'Hob cleaned',
    'Inside microwave cleaned',
    'Floor hoovered and mopped',
    'Bins emptied'
  ] }
];

export const DEEP_EXTRAS = {
  section: 'Deep clean extras',
  deep: true,
  items: [
    'Inside kitchen cupboards',
    'Inside fridge and freezer',
    'All windows, inside',
    'Window surrounds and sills',
    'Inside the oven',
    'Skirting boards thoroughly wiped down'
  ]
};

// Airbnb changeovers additionally need the turnaround steps
export const TURNAROUND = {
  section: 'Changeover',
  items: [
    'Strip beds and collect used linen',
    'Make beds with fresh linen',
    'Replace towels',
    'Restock consumables',
    'Check for damage and report with photos',
    'Check for items left behind'
  ]
};

export const FINISH = {
  section: 'Finish',
  items: [
    'Photo of each finished room',
    'Doors locked / keys returned as instructed'
  ]
};

export function checklistFor(serviceId) {
  const list = [...STANDARD_SECTIONS];
  if (serviceId === 'airbnb') list.push(TURNAROUND);
  list.push(DEEP_EXTRAS);
  list.push(FINISH);
  return list;
}

const round2 = n => Math.round(n * 100) / 100;

export const TEAM_SUPPLEMENT = 10; // flat fee for a two-cleaner Team Clean

// Quote calculator — returns price + duration for a booking request.
// Recurring plans: the first visit is a "reset clean" charged without the
// frequency discount; the discounted rate applies from visit two (Klea model).
// Team Clean: two cleaners, same cleaner-hours, half the time on site, +£10.
export function quote({ serviceId, size = 3, addonIds = [], addonQty = {}, frequency = 'once', teamClean = false, customAmount = null, customLabel = '' }) {
  const svc = SERVICES.find(s => s.id === serviceId);
  if (!svc) throw new Error('Unknown service: ' + serviceId);
  const freq = FREQUENCIES.find(f => f.id === frequency) || FREQUENCIES[0];

  let base, mins;
  if (svc.sized === 'bedrooms') {
    base = svc.basePrice + svc.perBedroom * size;
    mins = svc.baseMins + svc.minsPerBedroom * size;
  } else {
    base = svc.basePrice + svc.perUnit * size;
    mins = svc.baseMins + svc.minsPerUnit * size;
  }

  // Add-ons may be charged per unit (e.g. three bed changes)
  const addons = ADDONS.filter(a => addonIds.includes(a.id)).map(a => {
    const qty = a.perUnit ? Math.max(1, parseInt(addonQty[a.id], 10) || 1) : 1;
    return { id: a.id, name: a.perUnit ? `${a.name} × ${qty}` : a.name, price: round2(a.price * qty), mins: a.mins * qty, qty };
  });
  const addonTotal = round2(addons.reduce((t, a) => t + a.price, 0));
  mins += addons.reduce((t, a) => t + a.mins, 0);

  const supplement = teamClean ? TEAM_SUPPLEMENT : 0;
  const discount = round2((base + addonTotal) * freq.discount);
  let total = round2((base + addonTotal) - discount + supplement);
  let firstVisitTotal = frequency === 'once' ? total : round2(base + addonTotal + supplement);

  // The office can override the whole price with a custom amount
  const custom = customAmount === null || customAmount === '' ? null : round2(+customAmount);
  if (custom !== null && !Number.isNaN(custom)) {
    total = custom;
    firstVisitTotal = custom;
  }

  const cleanerMins = Math.round(mins / 15) * 15;
  const onSiteMins = teamClean ? Math.max(30, Math.ceil(cleanerMins / 2 / 15) * 15) : cleanerMins;

  return {
    service: svc.name,
    base: round2(base),
    customAmount: custom,
    customLabel,
    addons: addons.map(a => ({ id: a.id, name: a.name, price: a.price, qty: a.qty })),
    addonTotal,
    frequency: freq.name,
    discount,
    teamClean: !!teamClean,
    teamSupplement: supplement,
    total,
    firstVisitTotal,
    cleanerMins,
    durationMins: onSiteMins
  };
}

// Client-facing FAQs, shown on the booking site. Every promise here is backed
// by a real feature (photos, ratings, re-clean, reset pricing, Team Clean,
// coverage check, cancellation policy).
export const FAQS = [
  {
    q: 'Will I always have the same cleaner?',
    a: 'Yes. Regular customers are matched with one cleaner who comes every visit, so they learn exactly how you like things. If they are ever away, we will offer you a vetted cover cleaner first.'
  },
  {
    q: 'Do I need to provide products or equipment?',
    a: 'No. Your cleaner brings the full Klea kit: thoughtfully chosen surface, floor and kitchen products that are plant based and safe around children and pets once dry, plus a professional grade toilet cleaner, because proper sanitation matters. Every home gets the same products, the same finish and the same fresh result.'
  },
  {
    q: 'Why is my first clean priced differently?',
    a: 'Your first visit is a reset clean, charged at our one off rate. First cleans genuinely take longer because we are bringing your home up to the Klea standard for the first time. From visit two, your weekly or fortnightly rate applies and stays there.'
  },
  {
    q: 'What if my home needs more time than I have booked?',
    a: 'We will never rush, and we will never silently skip things either. Your cleaner works your priority list to the full standard for the hours booked. If your home realistically needs more time, we will tell you after your first visit and you choose: add hours, or keep your time and rotate priorities each visit.'
  },
  {
    q: 'Can I have two cleaners to get it done faster?',
    a: 'Yes, we call it a Team Clean. You pay for the same cleaner hours (a 4 hour clean is 4 cleaner hours whether one person takes 4 hours or two take 2), plus a £10 team supplement. Perfect for deep cleans, big homes, and anyone who wants their house back by lunchtime. Just tick the option when you book.'
  },
  {
    q: 'What is your cancellation policy?',
    a: 'Reschedule or cancel free of charge until midday the day before your clean. After that, a 50% fee applies, and if your cleaner arrives but cannot get in, the full price applies. Your cleaner has reserved that time for you, so this protects their earnings.'
  },
  {
    q: 'How do add-ons work?',
    a: 'Tick them when you book and they are done within the same visit for the flat prices on the menu. Add-ons add a little time to the visit rather than eating into your cleaning hours, so your home never gets less care because you fancied a clean oven. Add or remove them clean by clean.'
  },
  {
    q: 'Is there a contract or minimum term?',
    a: 'None. You can pause, change or cancel your cleans any time up to midday the day before, free of charge. We would rather earn your loyalty than lock it in.'
  },
  {
    q: 'What areas do you cover?',
    a: 'South Manchester, Stockport and the surrounding area (M and SK postcodes). Pop your postcode in when you book and we will confirm instantly.'
  },
  {
    q: 'What if I am not happy with a clean?',
    a: 'Tell us within 24 hours and we will re-clean the areas in question free of charge. Every clean is photographed and rated, so issues are rare and fixed fast.'
  }
];
