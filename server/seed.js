// Demo seed data for Klea. Staff and clients are clustered around
// Manchester outcodes so the postcode-patch scheduling has something to bite on.
// ~10 weeks of completed job history is generated so payroll and the P&L
// report have real numbers behind them.
import { quote, checklistFor } from './catalogue.js';

const iso = d => d.toISOString().slice(0, 10);
function addDays(base, n) { const d = new Date(base); d.setDate(d.getDate() + n); return d; }

export function seed() {
  const today = new Date();

  const staff = [
    {
      id: 1, name: 'Sophie Turner', phone: '07700 900101', postcode: 'M20 4EF', colour: '#D8BFA3',
      days: [1, 2, 3, 4, 5], start: '08:00', end: '16:00', active: true,
      photo: 'https://randomuser.me/api/portraits/women/44.jpg',
      bio: 'Loves leaving a kitchen so shiny you can see your face in the hob',
      rate: 13.50,
      legal: {
        dbs: { status: 'clear', issued: '2025-03-12', recheckDue: '2028-03-12' },
        rightToWork: { verified: true, checkedOn: '2025-03-01' },
        contract: { signedOn: '2025-03-10' },
        training: { coshh: '2026-01-15', healthSafety: '2026-01-15' }
      }
    },
    {
      id: 2, name: 'Priya Sharma', phone: '07700 900102', postcode: 'M21 8XA', colour: '#C9A36A',
      days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00', active: true,
      photo: 'https://randomuser.me/api/portraits/women/68.jpg',
      bio: 'Bathroom perfectionist, obsessed with streak free glass',
      rate: 13.00,
      legal: {
        dbs: { status: 'clear', issued: '2025-06-20', recheckDue: '2028-06-20' },
        rightToWork: { verified: true, checkedOn: '2025-06-10' },
        contract: { signedOn: '2025-06-18' },
        training: { coshh: '2026-02-02', healthSafety: '2026-02-02' }
      }
    },
    {
      id: 3, name: 'Dan Kowalski', phone: '07700 900103', postcode: 'M4 5JD', colour: '#C98A5D',
      days: [1, 2, 3, 4, 5, 6], start: '07:00', end: '15:00', active: true,
      photo: 'https://randomuser.me/api/portraits/men/32.jpg',
      bio: 'Airbnb turnaround specialist, never misses a checkout deadline',
      rate: 14.00, weekendRate: 15.50,
      legal: {
        dbs: { status: 'clear', issued: '2023-09-30', recheckDue: '2026-09-30' },
        rightToWork: { verified: true, checkedOn: '2023-09-15' },
        contract: { signedOn: '2023-09-28' },
        training: { coshh: '2025-11-05', healthSafety: '2025-11-05' }
      }
    },
    {
      id: 4, name: 'Aisha Begum', phone: '07700 900104', postcode: 'M14 6PL', colour: '#BCA88E',
      days: [2, 3, 4, 5, 6], start: '08:00', end: '16:00', active: true,
      photo: 'https://randomuser.me/api/portraits/women/65.jpg',
      bio: 'End of tenancy expert with an eagle eye for skirting boards',
      rate: 13.50, weekendRate: 15.00,
      legal: {
        dbs: { status: 'clear', issued: '2024-05-11', recheckDue: '2027-05-11' },
        rightToWork: { verified: true, checkedOn: '2024-05-01' },
        contract: { signedOn: '2024-05-09' },
        training: { coshh: '2026-04-20', healthSafety: '2026-04-20' }
      }
    },
    {
      id: 5, name: 'Liam O’Connor', phone: '07700 900105', postcode: 'SK4 3HJ', colour: '#B5764C',
      days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00', active: true,
      photo: 'https://randomuser.me/api/portraits/men/45.jpg',
      bio: 'Loves a deep clean, the tougher the job the better',
      rate: 14.50,
      legal: {
        dbs: { status: 'clear', issued: '2024-11-02', recheckDue: '2027-11-02' },
        rightToWork: { verified: true, checkedOn: '2024-10-20' },
        contract: { signedOn: '2024-11-01' },
        training: { coshh: '2026-06-30', healthSafety: '2026-06-30' }
      }
    },
    {
      id: 6, name: 'Grace Whitfield', phone: '07700 900106', postcode: 'M33 2AB', colour: '#E0D2B8',
      days: [1, 3, 5, 6], start: '09:00', end: '15:00', active: true,
      photo: 'https://randomuser.me/api/portraits/women/26.jpg',
      bio: 'Gentle with your home, absolutely ruthless with dust',
      rate: 12.50,
      legal: {
        dbs: { status: 'clear', issued: '2025-08-14', recheckDue: '2028-08-14' },
        rightToWork: { verified: true, checkedOn: '2025-08-01' },
        contract: { signedOn: '2025-08-12' },
        training: { coshh: '2025-09-10', healthSafety: '2025-09-10' }
      }
    }
  ];

  // Personal and legal details every UK cleaning employer should hold on file
  const staffDetails = {
    1: { email: 'sophie@klea.example.com', address: '12 Elmsmere Road, Didsbury, M20 6DX', dob: '1993-04-18', niNumber: 'QQ 12 34 56 A', rtwDoc: 'UK passport', dbsCert: '001234567891', emergencyContact: { name: 'Mark Turner (husband)', phone: '07700 900201' }, bank: 'Monzo •••• 4471' },
    2: { email: 'priya@klea.example.com', address: '4 Nicolas Road, Chorlton, M21 9LR', dob: '1989-11-02', niNumber: 'QQ 23 45 67 B', rtwDoc: 'UK passport', dbsCert: '001234567892', emergencyContact: { name: 'Anil Sharma (brother)', phone: '07700 900202' }, bank: 'Barclays •••• 8830' },
    3: { email: 'dan@klea.example.com', address: 'Flat 9, Tariff Street, M1 2FF', dob: '1996-02-27', niNumber: 'QQ 34 56 78 C', rtwDoc: 'EU settled status (share code checked)', dbsCert: '001234567893', emergencyContact: { name: 'Ola Kowalska (sister)', phone: '07700 900203' }, bank: 'Starling •••• 2214' },
    4: { email: 'aisha@klea.example.com', address: '76 Braemar Road, Fallowfield, M14 6PG', dob: '1991-07-09', niNumber: 'QQ 45 67 89 D', rtwDoc: 'UK passport', dbsCert: '001234567894', emergencyContact: { name: 'Yusuf Begum (husband)', phone: '07700 900204' }, bank: 'HSBC •••• 9902' },
    5: { email: 'liam@klea.example.com', address: '31 Heaton Moor Road, Stockport, SK4 4NX', dob: '1987-12-30', niNumber: 'QQ 56 78 90 E', rtwDoc: 'Irish passport', dbsCert: '001234567895', emergencyContact: { name: 'Ciara O’Connor (wife)', phone: '07700 900205' }, bank: 'Nationwide •••• 5147' },
    6: { email: 'grace@klea.example.com', address: '5 Woodbourne Road, Sale, M33 3SY', dob: '1999-06-14', niNumber: 'QQ 67 89 01 F', rtwDoc: 'UK passport', dbsCert: '001234567896', emergencyContact: { name: 'Pauline Whitfield (mum)', phone: '07700 900206' }, bank: 'Monzo •••• 3368' }
  };
  for (const s of staff) {
    const d = staffDetails[s.id];
    if (!d) continue;
    s.email = d.email; s.address = d.address; s.dob = d.dob; s.niNumber = d.niNumber;
    s.emergencyContact = d.emergencyContact; s.bank = d.bank;
    s.legal.rightToWork.document = d.rtwDoc;
    s.legal.dbs.certNumber = d.dbsCert;
  }

  const clients = [
    { id: 1, name: 'Hannah Price', email: 'hannah.price@example.com', phone: '07700 800201', postcode: 'M20 2TH', address: '14 Larch Avenue, Didsbury', type: 'residential', notes: 'Key in lockbox, code 4471. Dog friendly.' },
    { id: 2, name: 'James Whitmore', email: 'james.w@example.com', phone: '07700 800202', postcode: 'M21 9GH', address: '3 Beech Road, Chorlton', type: 'residential', notes: '' },
    { id: 3, name: 'Northern Quarter Lofts', email: 'host@nqlofts.example.com', phone: '07700 800203', postcode: 'M4 1LZ', address: 'Unit 7, Hilton Street', type: 'airbnb', notes: 'Check-out 10am, check-in 3pm. Linen in hallway cupboard.' },
    { id: 4, name: 'Fallowfield Lettings', email: 'ops@fallowlets.example.com', phone: '07700 800204', postcode: 'M14 6NB', address: 'Various — see job notes', type: 'landlord', notes: 'End of tenancy work, invoice monthly.' },
    { id: 5, name: 'Bramhall Dental Practice', email: 'admin@bramhalldental.example.com', phone: '07700 800205', postcode: 'SK7 1AW', address: '22 High Street, Bramhall', type: 'commercial', notes: 'Clean after 6pm only. Alarm code with practice manager.' },
    { id: 6, name: 'Hyphen Creative Studio', email: 'studio@hyphen.example.com', phone: '07700 800206', postcode: 'M4 5BQ', address: '2nd Floor, Blossom Street', type: 'office', notes: '18 desks, fob entry.' },
    { id: 7, name: 'Margaret Ellis', email: 'm.ellis@example.com', phone: '07700 800207', postcode: 'M33 4RS', address: '8 Priory Close, Sale', type: 'residential', notes: 'Prefers Grace. Tuesday or Friday mornings.' },
    { id: 8, name: 'Tom Barker', email: 'tom.barker@example.com', phone: '07700 800208', postcode: 'SK4 4JR', address: '51 Heaton Moor Road', type: 'residential', notes: '' }
  ];

  // Helper to build a booking with checklist + price
  let bookingId = 0, msgId = 0, payId = 0;
  const bookings = [], messages = [], payments = [];

  function addBooking({ clientId, serviceId, size, addonIds = [], frequency = 'once', dayOffset, time, staffId, status = 'booked', seriesId = null, notes = '' }) {
    const q = quote({ serviceId, size, addonIds, frequency });
    const id = ++bookingId;
    const date = iso(addDays(today, dayOffset));
    const checklist = [];
    let ci = 0;
    for (const sec of checklistFor(serviceId)) {
      for (const item of sec.items) {
        checklist.push({ id: ++ci, section: sec.section, label: item, done: status === 'completed' });
      }
    }
    bookings.push({
      id, clientId, serviceId, size, addonIds, frequency, seriesId,
      date, start: time, durationMins: q.durationMins,
      staffId, status, price: q.total, teamClean: false,
      photos: [], rating: status === 'completed' ? (id % 5 === 0 ? 4 : 5) : null,
      notes, checklist,
      createdAt: new Date().toISOString()
    });
    return bookings[bookings.length - 1];
  }

  // ---- ~10 weeks of completed history for the recurring series ----
  for (let w = 1; w <= 10; w++) {
    addBooking({ clientId: 1, serviceId: 'house-regular', size: 3, addonIds: ['ironing'], frequency: 'weekly', dayOffset: -7 * w, time: '09:00', staffId: 1, status: 'completed', seriesId: 'S1' });
    addBooking({ clientId: 3, serviceId: 'airbnb', size: 1, addonIds: ['linen', 'restock'], frequency: 'weekly', dayOffset: -3 - 7 * (w - 1), time: '10:30', staffId: 3, status: 'completed', seriesId: 'S3' });
    addBooking({ clientId: 5, serviceId: 'commercial', size: 120, frequency: 'weekly', dayOffset: -2 - 7 * (w - 1), time: '18:00', staffId: 5, status: 'completed', seriesId: 'S5' });
    addBooking({ clientId: 6, serviceId: 'office', size: 160, frequency: 'weekly', dayOffset: -7 * w, time: '17:30', staffId: 3, status: 'completed', seriesId: 'S6' });
  }
  for (let w = 1; w <= 5; w++) {
    addBooking({ clientId: 2, serviceId: 'house-regular', size: 2, frequency: 'fortnightly', dayOffset: -6 - 14 * (w - 1), time: '10:00', staffId: 2, status: 'completed', seriesId: 'S2' });
    addBooking({ clientId: 7, serviceId: 'house-regular', size: 2, frequency: 'fortnightly', dayOffset: -13 - 14 * (w - 1), time: '09:30', staffId: 6, status: 'completed', seriesId: 'S7' });
  }
  // Scattered one-off jobs for revenue variety
  addBooking({ clientId: 8, serviceId: 'deep-clean', size: 3, addonIds: ['oven'], dayOffset: -9, time: '09:00', staffId: 5, status: 'completed' });
  addBooking({ clientId: 4, serviceId: 'end-of-tenancy', size: 3, addonIds: ['oven', 'carpet'], dayOffset: -20, time: '08:30', staffId: 4, status: 'completed' });
  addBooking({ clientId: 4, serviceId: 'end-of-tenancy', size: 2, addonIds: ['oven'], dayOffset: -34, time: '08:30', staffId: 4, status: 'completed' });
  addBooking({ clientId: 8, serviceId: 'house-oneoff', size: 3, addonIds: ['windows-in'], dayOffset: -47, time: '11:00', staffId: 2, status: 'completed' });
  addBooking({ clientId: 4, serviceId: 'end-of-tenancy', size: 4, addonIds: ['oven', 'carpet-deep'], dayOffset: -55, time: '08:30', staffId: 4, status: 'completed' });

  // ---- Today / upcoming ----
  addBooking({ clientId: 1, serviceId: 'house-regular', size: 3, addonIds: ['ironing'], frequency: 'weekly', dayOffset: 0, time: '09:00', staffId: 1, status: 'in_progress', seriesId: 'S1' });
  addBooking({ clientId: 3, serviceId: 'airbnb', size: 1, addonIds: ['linen', 'restock'], frequency: 'weekly', dayOffset: 0, time: '10:30', staffId: 3, seriesId: 'S3' });
  addBooking({ clientId: 6, serviceId: 'office', size: 160, frequency: 'weekly', dayOffset: 0, time: '17:30', staffId: 3, seriesId: 'S6' });
  addBooking({ clientId: 7, serviceId: 'house-regular', size: 2, frequency: 'fortnightly', dayOffset: 1, time: '09:30', staffId: 6, seriesId: 'S7' });
  addBooking({ clientId: 4, serviceId: 'end-of-tenancy', size: 4, addonIds: ['oven', 'carpet-deep', 'windows-in'], dayOffset: 2, time: '08:30', staffId: 4, notes: '124 Wilmslow Road — collect keys from office first.' });
  addBooking({ clientId: 8, serviceId: 'deep-clean', size: 3, addonIds: ['oven', 'limescale'], dayOffset: 3, time: '09:00', staffId: 5 });
  addBooking({ clientId: 2, serviceId: 'house-regular', size: 2, frequency: 'fortnightly', dayOffset: 4, time: '10:00', staffId: 2, seriesId: 'S2' });
  addBooking({ clientId: 5, serviceId: 'commercial', size: 120, frequency: 'weekly', dayOffset: 5, time: '18:00', staffId: 5, seriesId: 'S5' });

  // Payments: completed work is paid, upcoming is authorised
  for (const b of bookings) {
    if (b.status !== 'cancelled') {
      payments.push({ id: ++payId, bookingId: b.id, clientId: b.clientId, amount: b.price, method: 'Card (demo)', status: b.status === 'completed' ? 'paid' : 'authorised', date: b.date });
    }
  }

  // ---- Payouts: wages settled up to a fortnight ago, recent work still due ----
  const payouts = [];
  const cutoff = iso(addDays(today, -14));
  let poId = 0;
  for (const s of staff) {
    const earned = bookings
      .filter(b => b.staffId === s.id && b.status === 'completed' && b.date <= cutoff)
      .reduce((t, b) => t + (b.durationMins / 60) * s.rate, 0);
    if (earned > 0) {
      payouts.push({
        id: ++poId, staffId: s.id, amount: Math.round(earned * 100) / 100,
        period: 'Wages up to ' + cutoff, method: 'Bank transfer (demo)', date: cutoff
      });
    }
  }

  // Sample "every clean is photographed" evidence on the most recent completed clean
  const svgPhoto = (label, bg) => 'data:image/svg+xml;base64,' + Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="${bg}"/><rect x="20" y="20" width="440" height="320" rx="16" fill="none" stroke="#FBF8F1" stroke-width="3" opacity="0.6"/><text x="240" y="175" text-anchor="middle" font-family="Georgia, serif" font-size="30" fill="#FBF8F1">${label}</text><text x="240" y="210" text-anchor="middle" font-family="Arial" font-size="15" fill="#FBF8F1" opacity="0.8">demo job photo</text></svg>`
  ).toString('base64');
  const lastDone = [...bookings].filter(b => b.status === 'completed').sort((a, b) => b.date.localeCompare(a.date))[0];
  if (lastDone) {
    lastDone.photos = [
      { id: 1, dataUrl: svgPhoto('Kitchen, finished', '#B5764C'), caption: 'Kitchen after clean', takenAt: new Date().toISOString() },
      { id: 2, dataUrl: svgPhoto('Bathroom, finished', '#8C8174'), caption: 'Bathroom after clean', takenAt: new Date().toISOString() },
      { id: 3, dataUrl: svgPhoto('Living room, finished', '#C9A36A'), caption: 'Living room after clean', takenAt: new Date().toISOString() }
    ];
  }

  // A few messages
  function addMessage(clientId, bookingId, channel, body, dayOffset = 0) {
    messages.push({ id: ++msgId, clientId, bookingId, channel, direction: 'out', body, createdAt: addDays(today, dayOffset).toISOString() });
  }
  addMessage(1, bookingId - 7, 'sms', 'Hi Hannah, Sophie is on her way for your 9am clean this morning. Klea ✦', 0);
  addMessage(3, bookingId - 6, 'email', 'Changeover booked for today 10:30. Dan will send room photos once the loft is guest-ready.', 0);
  addMessage(7, bookingId - 4, 'sms', 'Hi Margaret, just to confirm Grace will be with you tomorrow at 9:30am. Klea ✦', -1);
  addMessage(4, bookingId - 3, 'email', 'End of tenancy clean confirmed for 124 Wilmslow Road. Aisha’s team will collect keys from your office at 8am.', -1);

  // ---- Inventory (the Klea kit) ----
  const inventory = [
    { id: 1, name: 'All-purpose surface cleaner (5L)', unitCost: 9.50, stock: 6, reorderAt: 4 },
    { id: 2, name: 'Glass and mirror cleaner (750ml)', unitCost: 2.80, stock: 11, reorderAt: 6 },
    { id: 3, name: 'Professional toilet cleaner (1L)', unitCost: 3.40, stock: 3, reorderAt: 6 },
    { id: 4, name: 'Limescale remover (1L)', unitCost: 4.20, stock: 8, reorderAt: 4 },
    { id: 5, name: 'Oven degreaser (750ml)', unitCost: 5.10, stock: 5, reorderAt: 3 },
    { id: 6, name: 'Microfibre cloths (pack of 20)', unitCost: 8.00, stock: 4, reorderAt: 3 },
    { id: 7, name: 'Mop heads (pack of 5)', unitCost: 11.50, stock: 2, reorderAt: 3 },
    { id: 8, name: 'Bin liners (roll of 100)', unitCost: 6.20, stock: 9, reorderAt: 5 },
    { id: 9, name: 'Nitrile gloves (box of 100)', unitCost: 7.80, stock: 7, reorderAt: 4 }
  ];

  // ---- Expense ledger (feeds the P&L) ----
  // Categories: supplies, fuel, equipment, insurance, software, marketing, other
  const expenses = [];
  let exId = 0;
  const monthISO = (offset, day) => {
    // build the date string directly to avoid UTC shifting day-1 into the prior month
    const d = new Date(today.getFullYear(), today.getMonth() - offset, 15);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };
  for (let m = 3; m >= 0; m--) {
    // skip entries dated in the future for the current month
    const push = (day, category, description, amount) => {
      const date = monthISO(m, day);
      if (date <= iso(today)) expenses.push({ id: ++exId, date, category, description, amount });
    };
    push(1, 'insurance', 'Employers’ + public liability (monthly)', 68);
    push(1, 'software', 'Booking system and phone apps', 39);
    push(3, 'marketing', 'Local ads and flyers', 150);
    push(8, 'fuel', 'Van fuel', 52 + m * 6);
    push(21, 'fuel', 'Van fuel', 48 + m * 4);
    push(12, 'supplies', 'Cleaning products restock', 58 + m * 5);
  }
  expenses.push({ id: ++exId, date: monthISO(2, 15), category: 'equipment', description: 'Henry vacuum (replacement)', amount: 189 });
  expenses.push({ id: ++exId, date: monthISO(0, Math.min(today.getDate(), 10)), category: 'equipment', description: 'Flat-mop system', amount: 45 });

  // ---- Kleaner applications (recruitment pipeline) ----
  const applications = [
    {
      id: 1, name: 'Chloe Barnes', email: 'chloe.b@example.com', phone: '07700 900301',
      postcode: 'M19 2FF', transport: 'Own car', days: ['Mon', 'Tue', 'Wed', 'Thu'], hours: 'Mornings',
      experience: 'Two years domestic cleaning', rightToWork: 'yes', dbs: 'have',
      about: 'Currently cleaning for a family in Levenshulme who are moving away. I love the before and after of a proper kitchen clean.',
      status: 'new', appliedAt: addDays(today, -1).toISOString()
    },
    {
      id: 2, name: 'Marta Nowak', email: 'marta.n@example.com', phone: '07700 900302',
      postcode: 'SK5 6AB', transport: 'Public transport', days: ['Wed', 'Thu', 'Fri', 'Sat'], hours: 'Flexible',
      experience: 'Hotel housekeeping, three years', rightToWork: 'yes', dbs: 'willing',
      about: 'Used to 30 minute hotel turnarounds, so Airbnb changeovers would suit me well.',
      status: 'interview', appliedAt: addDays(today, -4).toISOString()
    }
  ];

  return {
    staff, clients, bookings, messages, payments, payouts, inventory, expenses, applications,
    timesheets: [],
    absences: [],
    settings: {
      businessName: 'Klea', currency: 'GBP', dayStart: '07:00', dayEnd: '19:00',
      bookingMode: 'instant',
      coverage: { areas: ['FY', 'PR'], label: 'the Fylde Coast and surrounding area (FY and PR postcodes)' },
      // Company-level legal documents (shown on the Staff page)
      companyLegal: [
        { id: 'el', name: 'Employers’ liability insurance', detail: 'Hiscox · policy EL-2298104 · £5m cover (legal requirement)', expires: '2027-02-28' },
        { id: 'pl', name: 'Public liability insurance', detail: 'Hiscox · policy PL-2298105 · £2m cover', expires: '2027-02-28' },
        { id: 'ico', name: 'ICO data protection registration', detail: 'Reg ZB771204 (required for holding client data)', expires: '2026-10-05' },
        { id: 'waste', name: 'Waste carrier registration', detail: 'CBDU-559812 (needed if removing waste from jobs)', expires: '2027-06-14' }
      ],
      // Fixed monthly running costs used by the P&L report
      overheads: [
        { name: 'Insurance (EL + PL)', monthly: 68 },
        { name: 'Booking system and software', monthly: 39 },
        { name: 'Cleaning equipment and van costs', monthly: 210 },
        { name: 'Phone and admin', monthly: 45 },
        { name: 'Marketing', monthly: 150 }
      ],
      suppliesPerJob: 4.50
    }
  };
}
