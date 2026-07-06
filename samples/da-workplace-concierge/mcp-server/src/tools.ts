import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CURRENT_USER_ID,
  bookDesk,
  cancelBooking,
  getBookings,
  getOfficeMap,
  getUserName,
  todayIso,
  whoIsInOffice,
} from "./data.js";

const OFFICE_MAP_WIDGET_URI = "ui://widget/office-map.html";
const MY_BOOKINGS_WIDGET_URI = "ui://widget/my-bookings.html";

const floorParam = z
  .number()
  .int()
  .min(1)
  .max(2)
  .optional()
  .describe("Floor number (1 or 2). Defaults to 1.");

const dateParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .describe("Date in YYYY-MM-DD format. Defaults to today.");

function myBookingsPayload() {
  return {
    userId: CURRENT_USER_ID,
    userName: getUserName(CURRENT_USER_ID),
    bookings: getBookings(CURRENT_USER_ID),
  };
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "get_office_map",
    {
      title: "Get office map",
      description:
        "Shows an interactive seat map of an office floor for a given date, with desk and meeting room availability.",
      inputSchema: { floor: floorParam, date: dateParam },
      annotations: { readOnlyHint: true },
      _meta: { "openai/outputTemplate": OFFICE_MAP_WIDGET_URI },
    },
    async ({ floor, date }) => {
      const map = getOfficeMap(floor ?? 1, date ?? todayIso());
      return {
        content: [
          {
            type: "text",
            text: `${map.floorName} on ${map.date}: ${map.summary.available} of ${map.desks.length} desks available. The interactive map lets the user pick and book a desk directly.`,
          },
        ],
        structuredContent: map as unknown as Record<string, unknown>,
      };
    }
  );

  server.registerTool(
    "book_desk",
    {
      title: "Book a desk",
      description: "Books a desk for the current user on a given date.",
      inputSchema: {
        deskId: z.string().describe("The desk identifier, for example desk-1-04."),
        date: dateParam,
      },
      _meta: { "openai/outputTemplate": OFFICE_MAP_WIDGET_URI },
    },
    async ({ deskId, date }) => {
      const bookingDate = date ?? todayIso();
      const result = bookDesk(deskId, bookingDate, CURRENT_USER_ID);
      const floor = result.booking?.floor ?? (Number(deskId.split("-")[1]) || 1);
      const map = getOfficeMap(floor, bookingDate);
      return {
        content: [{ type: "text", text: result.message }],
        structuredContent: { ...result, ...map } as unknown as Record<string, unknown>,
      };
    }
  );

  server.registerTool(
    "get_my_bookings",
    {
      title: "Get my bookings",
      description: "Lists the current user's upcoming desk and meeting room bookings.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
      _meta: { "openai/outputTemplate": MY_BOOKINGS_WIDGET_URI },
    },
    async () => {
      const payload = myBookingsPayload();
      return {
        content: [
          {
            type: "text",
            text: `${payload.userName} has ${payload.bookings.length} upcoming booking(s). The widget lists them with cancel buttons.`,
          },
        ],
        structuredContent: payload as unknown as Record<string, unknown>,
      };
    }
  );

  server.registerTool(
    "cancel_booking",
    {
      title: "Cancel a booking",
      description: "Cancels one of the current user's bookings by id.",
      inputSchema: {
        bookingId: z.string().describe("The booking id to cancel, for example bk-0007."),
      },
      _meta: { "openai/outputTemplate": MY_BOOKINGS_WIDGET_URI },
    },
    async ({ bookingId }) => {
      const result = cancelBooking(bookingId, CURRENT_USER_ID);
      const payload = { ...result, ...myBookingsPayload() };
      return {
        content: [{ type: "text", text: result.message }],
        structuredContent: payload as unknown as Record<string, unknown>,
      };
    }
  );

  server.registerTool(
    "who_is_in_office",
    {
      title: "Who is in the office",
      description: "Lists colleagues with a desk booked on a given date.",
      inputSchema: { date: dateParam },
      annotations: { readOnlyHint: true },
    },
    async ({ date }) => {
      const result = whoIsInOffice(date ?? todayIso());
      const names = result.attendees
        .map((a) => `${a.name} (${a.team}) at desk ${a.deskLabel}, floor ${a.floor}`)
        .join("; ");
      return {
        content: [
          {
            type: "text",
            text:
              result.count === 0
                ? `Nobody has a desk booked on ${result.date}.`
                : `${result.count} people are in on ${result.date}: ${names}.`,
          },
        ],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }
  );
}
