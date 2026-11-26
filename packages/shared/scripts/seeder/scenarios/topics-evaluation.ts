const REQUESTS = [
  [
    "Find the receipt for our March subscription payment and send me its download link.",
    "Check whether invoice INV-482 includes our company tax number before I submit it to accounting.",
    "We paid for twelve seats but only use eight. Look up whether our next subscription bill reflects the reduction.",
    "Review the two card charges from Monday and tell me if we paid the same invoice twice.",
    "Download a PDF of our annual software subscription invoice for the finance folder.",
    "Look up the renewal date and amount due for our workspace subscription.",
    "Check the billing address attached to last month's subscription invoice; we moved offices.",
    "Find the outstanding balance on invoice INV-918 and tell me when payment is due.",
    "Retrieve the credit note issued after we canceled three subscription seats.",
    "Check whether the duplicate monthly subscription charge has been refunded.",
    "Compare the subtotal and sales tax on our latest software subscription bill.",
    "Our procurement team needs the purchase order number on the renewal invoice. Can you verify it?",
    "Find the subscription payment that matches the card transaction ending in 0427.",
    "Look up why the subscription invoice total changed after adding two team members.",
    "Retrieve the corrected subscription invoice with our new legal company name.",
    "Show me the billing history for the workspace during the previous quarter.",
    "Confirm that our subscription cancellation was recorded before the latest renewal charge.",
    "Find the invoice number for the bank transfer we made on Friday.",
    "Check whether our nonprofit discount appears on the annual subscription renewal.",
    "List our unpaid software subscription invoices with their due dates.",
  ],
  [
    "Find a walkable two-day itinerary in Kyoto using the opening hours in my saved places list.",
    "Plan a rainy afternoon in Porto around museums near our hotel.",
    "Build a family weekend in Copenhagen with an aquarium visit and short transit trips.",
    "Look up the ferry timetable and plan a day trip from Helsinki to Tallinn.",
    "Use the saved attraction hours to plan a relaxed Sunday in Vienna.",
    "Organize a three-day Lisbon itinerary with hills grouped into one afternoon.",
    "Check the train schedules for a day trip from Amsterdam to Haarlem.",
    "Find wheelchair-accessible sights for two days in Edinburgh using the city guide.",
    "Plan a Barcelona morning before our afternoon flight, including luggage collection.",
    "Arrange a Seoul sightseeing day around the palace opening times and a market lunch.",
    "Look up the museum reservation times and plan a half-day visit to Florence.",
    "Make a Tokyo itinerary with one neighborhood per day and minimal train changes.",
    "Check which Paris attractions on my list are closed on Tuesday and rearrange our route.",
    "Find a quiet beach and an indoor backup for our family day near Valencia.",
    "Build a one-day Berlin itinerary from my saved places with a midday rest.",
    "Use the local bus timetable to plan a day exploring the villages outside Salzburg.",
    "Plan a rainy weekend in Dublin with bookstores, galleries, and short walks.",
    "Find an itinerary for an eight-hour layover in Singapore using our flight details.",
    "Check the boat departures and organize a Stockholm archipelago excursion.",
    "Plan a short Prague visit with the old town early and an afternoon indoor activity.",
  ],
  [
    "Inspect the attached Node logs to locate why order.items is undefined in the checkout API.",
    "Read the Python traceback and identify the missing customer_id key in our webhook handler.",
    "Check the TypeScript response sample to explain why data.map is not a function.",
    "Look through the endpoint logs and identify which request field caused a null dereference.",
    "Use the attached traceback to suggest a fix for the Python webhook KeyError.",
    "Inspect the repository function that parses our API response and find the unexpected array shape.",
    "Review the failing integration test output for the account lookup endpoint.",
    "Read the request schema and find why empty address objects crash our Node service.",
    "Check the JSON payload sample against the decoder to explain the TypeError.",
    "Use the attached test failure to repair validation for missing order items.",
    "Open the error log and trace the undefined profile property in our API handler.",
    "Inspect the Python code that indexes the webhook payload and suggest a missing-field test.",
    "Read the stack trace from the invoice endpoint to locate the wrong property access.",
    "Compare the documented API response with the fixture that breaks our JavaScript parser.",
    "Use the stack trace to explain why accessing customer.address.city throws an exception.",
    "Inspect the request validator and determine why a null quantity reaches arithmetic code.",
    "Look at the failing test snapshot for the product API and identify the incompatible JSON shape.",
    "Read the handler source and find why a string is passed to the array mapper.",
    "Check our endpoint's traceback and locate the absent nested preferences object.",
    "Use the supplied request fixture to add a regression test for a missing customer field.",
  ],
  [
    "Open the sales workbook and calculate revenue by region for the previous quarter.",
    "Read the uploaded expense spreadsheet and summarize the five largest vendor totals.",
    "Compare January and February sales in the worksheet and calculate percentage growth.",
    "Find duplicate customer rows in the contacts CSV using email as the key.",
    "Summarize the monthly expense spreadsheet by department.",
    "Read the inventory workbook and flag products whose stock is below their reorder point.",
    "Calculate average delivery time by carrier from the shipping spreadsheet.",
    "Check the payroll export for missing employee IDs and list affected rows.",
    "Open the campaign CSV and compute conversion rates for each traffic source.",
    "Calculate total units sold per product from the uploaded order spreadsheet.",
    "Read the budget worksheet and compare actual spending with the planned amount.",
    "Find blank invoice dates in the accounts receivable CSV.",
    "Summarize support ticket counts by week from the attached spreadsheet.",
    "Look at the customer export and count signups by month without counting duplicates.",
    "Calculate average order value for each store in the sales workbook.",
    "Inspect the stock spreadsheet for negative quantities and invalid SKU values.",
    "Read the attendance workbook and compute participation percentages by team.",
    "Compare supplier prices in the two sheets and show the largest increases.",
    "Group the travel expense CSV by currency and add up each currency separately.",
    "Count overdue payments from the receivables spreadsheet using its due-date column.",
  ],
  [
    "Read the hiring team's calendars and find three interview slots for our backend candidate.",
    "Check the candidate's availability and schedule a forty-five-minute technical interview next week.",
    "Find a time when the designer candidate and both panelists are free on Thursday.",
    "Look up our interview room bookings and reserve a room for the final-round panel.",
    "Schedule a screening interview using the candidate's submitted availability.",
    "Check the recruiter calendar and move tomorrow's candidate call to Friday afternoon.",
    "Find a shared hour across London and New York interviewers for the engineering panel.",
    "Read the panel availability and propose two interview times with a fifteen-minute buffer.",
    "Check whether the candidate accepted the invitation for Monday's onsite interviews.",
    "Book a follow-up interview with the hiring manager in one of the candidate's free slots.",
    "Find a thirty-minute opening for a recruiting screen without overlapping the team meeting.",
    "Look up the interview schedule and move the portfolio presentation after lunch.",
    "Check both interviewers' calendars before confirming the data engineer candidate's time.",
    "Arrange a remote interview with the candidate in Sydney during their working hours.",
    "Find and book an interview room for Tuesday's two-person candidate panel.",
    "Read the availability form and suggest a time for the candidate's system design interview.",
    "Check our recruiting calendar for a replacement slot after the interviewer canceled.",
    "Find consecutive free slots for the candidate's coding exercise and manager conversation.",
    "Look up the interview invitation and check whether the room and video link are included.",
    "Schedule the final candidate conversation with the department lead for next week.",
  ],
] as const;

const COMPLETED = [
  [
    "The annual invoice PDF is ready at /documents/invoice-2026.pdf; it covers the full subscription period.",
    "The duplicate charge was refunded yesterday. The refund reference is RF-218 and the bank may take three working days to display it.",
    "The corrected invoice now lists the new company name. Its download is available in billing history as INV-482-R1.",
    "There are two unpaid invoices: INV-521 due September 20 and INV-544 due October 1. Both appear in billing history.",
  ],
  [
    "Start at the museum at 10:00, have lunch nearby, and visit the gardens at 14:00. Both venues are open on Sunday.",
    "Visit the palace at 09:30, walk to the market for lunch, and use the afternoon for the neighboring streets. The palace closes at 17:00.",
    "Visit the old museum in the morning, rest at the hotel after lunch, and explore the nearby park at 16:00. This avoids crossing the city twice.",
    "Walk through the old town before 10:00, pause for lunch, then visit the gallery at 14:00. The saved opening hours support this route.",
  ],
  [
    "The traceback points to payload['customer_id']. Validate that key before indexing, return a 400 for missing values, and add a missing-key test.",
    "The test fixture omits order.items. Require an array in request validation and return a 400 response before reaching map().",
    "customer.address is absent in the failing fixture. Validate the nested object or handle it explicitly before reading city.",
    "Add a request fixture without customer_id and assert a clear 400 response. Keep a valid fixture to confirm normal requests still succeed.",
  ],
  [
    "The expense totals are Engineering 18,400, Sales 9,200, and Operations 7,100. Blank department cells were listed separately for review.",
    "The worksheet totals are Product A 146 units, Product B 92, and Product C 81. All order rows were included once.",
    "Average order value is 42.50 for North, 39.20 for Central, and 47.10 for South, computed as revenue divided by order count.",
    "There are 17 unpaid rows whose due date is before today. Rows with missing due dates were excluded and listed for review.",
  ],
  [
    "The screening interview is booked for Tuesday at 10:00 in the candidate's timezone. The recruiter and candidate are both available.",
    "The hiring manager follow-up is booked for Wednesday at 15:00. Invitations include the candidate's timezone and the meeting link.",
    "Room Cedar is booked from 13:00 to 14:00 on Tuesday. Both panelists are free and the candidate invitation has been sent.",
    "The final conversation is booked for Thursday at 11:30. The department lead and candidate confirmed that slot was free.",
  ],
] as const;

const FAILURES = [
  {
    status:
      "The context lookup exceeded its deadline without returning a result.",
    toolOutput: {
      error: "deadline_exceeded",
      timeout_ms: 150,
      received_bytes: 0,
    },
    replies: [
      "The lookup timed out before I received the records needed for your request. I couldn't complete it; please retry later.",
      "I waited for the external service, but its response never arrived. Your request is still unfinished.",
      "The data fetch exceeded its time limit. I don't have the information needed to finish this task yet.",
      "The upstream request timed out, so I couldn't verify the necessary details or complete your task.",
    ],
  },
  {
    status:
      "The connected account is not permitted to read the requested resource.",
    toolOutput: {
      error: "access_denied",
      http_status: 403,
      resource_access: "denied",
    },
    replies: [
      "The connected account doesn't have access to the required records. Please grant read access before I can finish this request.",
      "The service returned a permission error. I couldn't retrieve the details needed for your task.",
      "Access to the requested resource was denied. Reconnect an account with the required permissions and retry.",
      "I couldn't open the source because this connection lacks read permission. The requested work remains incomplete.",
    ],
  },
  {
    status: "The external response could not be decoded as valid JSON.",
    toolOutput: {
      error: "response_decode_failed",
      expected: "JSON object",
      received: "<html>unexpected response</html>",
    },
    replies: [
      "The service returned an unreadable response instead of the expected structured data. I couldn't complete the request from it.",
      "The returned payload failed JSON decoding. I can't safely extract the details needed to finish your task.",
      "I received an HTML page where the tool expected JSON, so I could not interpret the result.",
      "The tool response had an invalid format. Please retry after the integration returns valid structured data.",
    ],
  },
  {
    status:
      "The lookup completed successfully but returned no matching records.",
    toolOutput: { matches: [], total: 0, complete: true },
    replies: [
      "The search returned no matching records, so I couldn't complete your request. Please check the selected source or identifier.",
      "The lookup ran successfully but found nothing matching the request. I need a corrected reference or an uploaded source to continue.",
      "No matching information was present in the connected source. I couldn't finish the task with an empty result.",
      "The tool returned an empty set of records. Please verify the source selection before I try this task again.",
    ],
  },
] as const;

export function topicEvaluationExamples() {
  return REQUESTS.flatMap((requests, theme) =>
    requests.map((input, position) => {
      const index = theme * 20 + position;
      const failure = FAILURES[position % 5];
      return {
        io: [
          input,
          failure
            ? failure.replies[(theme + Math.floor(position / 5)) % 4]!
            : COMPLETED[theme]![Math.floor(position / 5)]!,
        ] as const,
        index,
        batch: "evaluation",
        tool: {
          input: JSON.stringify({ request: input }),
          output: JSON.stringify(
            failure?.toolOutput ?? {
              result: COMPLETED[theme]![Math.floor(position / 5)],
              complete: true,
            },
          ),
          status: failure?.status ?? null,
          level: failure ? ("ERROR" as const) : ("DEFAULT" as const),
        },
      };
    }),
  );
}
