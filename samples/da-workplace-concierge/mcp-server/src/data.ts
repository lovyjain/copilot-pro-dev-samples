// In-memory sample data store for the Workplace Concierge MCP server.
// Module-level singleton: the store is shared across requests even though the
// Streamable HTTP transport is created per request (stateless mode). All state
// resets when the server restarts.

export interface Desk {
  id: string;
  label: string;
  floor: number;
  zone: string;
  x: number;
  y: number;
}

export interface Room {
  id: string;
  name: string;
  floor: number;
  capacity: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Employee {
  id: string;
  name: string;
  team: string;
}

export interface Booking {
  id: string;
  type: "desk" | "room";
  resourceId: string;
  userId: string;
  date: string;
  start?: string;
  end?: string;
  title?: string;
}

// The signed-in user. Authentication is anonymous in this sample, so a fixed
// demo user stands in for the caller. In production, derive the user from the
// OAuth token presented to the MCP server.
export const CURRENT_USER_ID = "u-alex";

const employees: Employee[] = [
  { id: "u-alex", name: "Alex Chen", team: "Engineering" },
  { id: "u-brooke", name: "Brooke Rivera", team: "Design" },
  { id: "u-carlos", name: "Carlos Mendes", team: "Engineering" },
  { id: "u-dana", name: "Dana Osei", team: "Marketing" },
  { id: "u-elif", name: "Elif Kaya", team: "Sales" },
  { id: "u-finn", name: "Finn Gallagher", team: "Engineering" },
  { id: "u-grace", name: "Grace Park", team: "HR" },
  { id: "u-hugo", name: "Hugo Lindqvist", team: "Finance" },
];

// Two floors, 24 desks each, laid out on a 6x4 grid per floor.
// Grid coordinates (x, y) are consumed by the seat-map widget to draw the SVG.
const ZONES: Record<number, string[]> = {
  1: ["Quiet zone", "Collaboration"],
  2: ["Focus pods", "Open space"],
};

function buildDesks(): Desk[] {
  const desks: Desk[] = [];
  for (const floor of [1, 2]) {
    for (let i = 0; i < 24; i++) {
      const col = i % 6;
      const row = Math.floor(i / 6);
      const zone = ZONES[floor][col < 3 ? 0 : 1];
      const num = String(i + 1).padStart(2, "0");
      desks.push({
        id: `desk-${floor}-${num}`,
        label: `${floor}.${num}`,
        floor,
        zone,
        x: col,
        y: row,
      });
    }
  }
  return desks;
}

const desks: Desk[] = buildDesks();

const rooms: Room[] = [
  { id: "room-1-aurora", name: "Aurora", floor: 1, capacity: 8, x: 0, y: 4, w: 3, h: 1 },
  { id: "room-1-borealis", name: "Borealis", floor: 1, capacity: 4, x: 3, y: 4, w: 3, h: 1 },
  { id: "room-2-cumulus", name: "Cumulus", floor: 2, capacity: 12, x: 0, y: 4, w: 3, h: 1 },
  { id: "room-2-drizzle", name: "Drizzle", floor: 2, capacity: 2, x: 3, y: 4, w: 3, h: 1 },
];

function isoDate(offsetDays: number): string {
  // Build from local date components: toISOString() would return the UTC
  // date, which is off by one around midnight in non-UTC timezones.
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function todayIso(): string {
  return isoDate(0);
}

let bookingCounter = 0;

function newBookingId(): string {
  bookingCounter += 1;
  return `bk-${String(bookingCounter).padStart(4, "0")}`;
}

// Seeded bookings for today and tomorrow so the map and lists have content
// on first run. The demo user has a desk booked tomorrow and a room today.
const bookings: Booking[] = [
  { id: newBookingId(), type: "desk", resourceId: "desk-1-02", userId: "u-brooke", date: isoDate(0) },
  { id: newBookingId(), type: "desk", resourceId: "desk-1-05", userId: "u-carlos", date: isoDate(0) },
  { id: newBookingId(), type: "desk", resourceId: "desk-1-09", userId: "u-dana", date: isoDate(0) },
  { id: newBookingId(), type: "desk", resourceId: "desk-2-14", userId: "u-elif", date: isoDate(0) },
  { id: newBookingId(), type: "desk", resourceId: "desk-2-15", userId: "u-finn", date: isoDate(0) },
  { id: newBookingId(), type: "desk", resourceId: "desk-1-03", userId: "u-grace", date: isoDate(1) },
  { id: newBookingId(), type: "desk", resourceId: "desk-1-10", userId: CURRENT_USER_ID, date: isoDate(1) },
  { id: newBookingId(), type: "desk", resourceId: "desk-2-20", userId: "u-hugo", date: isoDate(1) },
  {
    id: newBookingId(),
    type: "room",
    resourceId: "room-1-aurora",
    userId: CURRENT_USER_ID,
    date: isoDate(0),
    start: "10:00",
    end: "11:00",
    title: "Sprint planning",
  },
  {
    id: newBookingId(),
    type: "room",
    resourceId: "room-2-cumulus",
    userId: "u-dana",
    date: isoDate(0),
    start: "14:00",
    end: "15:30",
    title: "Campaign review",
  },
];

function employeeName(userId: string): string {
  return employees.find((e) => e.id === userId)?.name ?? "Unknown";
}

function deskById(deskId: string): Desk | undefined {
  return desks.find((d) => d.id === deskId);
}

export interface OfficeMap {
  floor: number;
  floorName: string;
  date: string;
  currentUserId: string;
  desks: Array<Desk & { status: "available" | "booked"; bookedBy?: string; bookedByUserId?: string }>;
  rooms: Array<Room & { bookings: Array<{ start?: string; end?: string; title?: string; bookedBy: string }> }>;
  summary: { available: number; booked: number };
}

export function getOfficeMap(floor: number, date: string): OfficeMap {
  const floorDesks = desks
    .filter((d) => d.floor === floor)
    .map((d) => {
      const booking = bookings.find(
        (b) => b.type === "desk" && b.resourceId === d.id && b.date === date
      );
      return {
        ...d,
        status: booking ? ("booked" as const) : ("available" as const),
        ...(booking ? { bookedBy: employeeName(booking.userId), bookedByUserId: booking.userId } : {}),
      };
    });
  const floorRooms = rooms
    .filter((r) => r.floor === floor)
    .map((r) => ({
      ...r,
      bookings: bookings
        .filter((b) => b.type === "room" && b.resourceId === r.id && b.date === date)
        .map((b) => ({ start: b.start, end: b.end, title: b.title, bookedBy: employeeName(b.userId) })),
    }));
  const booked = floorDesks.filter((d) => d.status === "booked").length;
  return {
    floor,
    floorName: `Floor ${floor}`,
    date,
    currentUserId: CURRENT_USER_ID,
    desks: floorDesks,
    rooms: floorRooms,
    summary: { available: floorDesks.length - booked, booked },
  };
}

export interface BookDeskResult {
  success: boolean;
  message: string;
  // Floor of the requested desk when it exists, so callers can render the
  // right floor's map without parsing desk ids.
  floor?: number;
  booking?: { id: string; deskId: string; deskLabel: string; floor: number; date: string; userId: string };
}

export function bookDesk(deskId: string, date: string, userId: string): BookDeskResult {
  const desk = deskById(deskId);
  if (!desk) {
    return { success: false, message: `Desk '${deskId}' does not exist.` };
  }
  const conflict = bookings.find(
    (b) => b.type === "desk" && b.resourceId === deskId && b.date === date
  );
  if (conflict) {
    return {
      success: false,
      floor: desk.floor,
      message: `Desk ${desk.label} is already booked by ${employeeName(conflict.userId)} on ${date}.`,
    };
  }
  const existing = bookings.find(
    (b) => b.type === "desk" && b.userId === userId && b.date === date
  );
  if (existing) {
    const existingDesk = deskById(existing.resourceId);
    return {
      success: false,
      floor: desk.floor,
      message: `You already have desk ${existingDesk?.label ?? existing.resourceId} booked on ${date}. Cancel it first to switch desks.`,
    };
  }
  const booking: Booking = { id: newBookingId(), type: "desk", resourceId: deskId, userId, date };
  bookings.push(booking);
  return {
    success: true,
    floor: desk.floor,
    message: `Desk ${desk.label} on floor ${desk.floor} booked for ${date}.`,
    booking: { id: booking.id, deskId, deskLabel: desk.label, floor: desk.floor, date, userId },
  };
}

export interface UserBooking {
  id: string;
  type: "desk" | "room";
  label: string;
  floor: number;
  date: string;
  start?: string;
  end?: string;
  title?: string;
}

export function getBookings(userId: string): UserBooking[] {
  const today = todayIso();
  return bookings
    .filter((b) => b.userId === userId && b.date >= today)
    .map((b) => {
      if (b.type === "desk") {
        const desk = deskById(b.resourceId);
        return {
          id: b.id,
          type: b.type,
          label: `Desk ${desk?.label ?? b.resourceId}`,
          floor: desk?.floor ?? 0,
          date: b.date,
        };
      }
      const room = rooms.find((r) => r.id === b.resourceId);
      return {
        id: b.id,
        type: b.type,
        label: `Room ${room?.name ?? b.resourceId}`,
        floor: room?.floor ?? 0,
        date: b.date,
        start: b.start,
        end: b.end,
        title: b.title,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface CancelResult {
  success: boolean;
  message: string;
  cancelledBookingId?: string;
}

export function cancelBooking(bookingId: string, userId: string): CancelResult {
  const index = bookings.findIndex((b) => b.id === bookingId);
  if (index === -1) {
    return { success: false, message: `Booking '${bookingId}' was not found.` };
  }
  if (bookings[index].userId !== userId) {
    return { success: false, message: `Booking '${bookingId}' belongs to another person and can't be cancelled.` };
  }
  bookings.splice(index, 1);
  return { success: true, message: `Booking ${bookingId} cancelled.`, cancelledBookingId: bookingId };
}

export interface Attendee {
  name: string;
  team: string;
  deskLabel: string;
  floor: number;
}

export function whoIsInOffice(date: string): { date: string; count: number; attendees: Attendee[] } {
  const attendees = bookings
    .filter((b) => b.type === "desk" && b.date === date)
    .map((b) => {
      const desk = deskById(b.resourceId);
      const employee = employees.find((e) => e.id === b.userId);
      return {
        name: employee?.name ?? "Unknown",
        team: employee?.team ?? "Unknown",
        deskLabel: desk?.label ?? b.resourceId,
        floor: desk?.floor ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { date, count: attendees.length, attendees };
}

export function getUserName(userId: string): string {
  return employeeName(userId);
}
