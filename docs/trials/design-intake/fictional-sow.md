# Scope of Work: Brightfold Route Portal

| | |
|-|-|
| Client | Brightfold Linen Services (fictional) |
| Project | Brightfold Route Portal |
| Date | November 2, 2026 |
| Client website | https://www.brightfold.example.com |
| Client contact | Dana Whitfield, Director of Operations, dana@brightfold.example.com |
| Pell contact | Project Lead, Pell Software |

## Project Overview

Brightfold Linen Services rents and launders tablecloths, napkins, aprons and towels for restaurants, hotels and event venues. About 40 drivers deliver clean linen and collect soiled linen on daily routes from three depots. Today drivers fill out paper tickets, dispatchers retype them, and restaurant managers dispute counts weeks later when the invoice arrives.

This project replaces the paper tickets with two web portals. Drivers use one on their phones, in the truck and at the loading dock, often with weak signal. Restaurant and hotel managers use the other to see what was delivered and collected, and to approve it. Counts that a driver records are reviewed by dispatch and billing before they become invoice lines.

Brightfold must keep every delivery record, count and photo for seven years, because customers and insurers can raise disputes long after a delivery.

## Project Assumptions

- Brightfold supplies its current customer list, location list and price list as spreadsheets before development starts.
- Drivers carry company-issued Android phones with a current Chrome browser. Phones are not shared between drivers.
- Drivers work in basements, loading docks and delivery bays where the signal is poor. The driver portal must tolerate a lost connection for the length of a stop.
- Brightfold's accounting system stays in place. This project produces invoice lines and a monthly export. It does not replace the accounting system.
- Brightfold has three depots, and each has its own dispatcher and billing clerk.
- Customer managers sign in with an email address and a password they choose. Brightfold does not want to manage customer passwords by phone.
- Brightfold will name one person to answer Pell's questions within two business days.

## Software Development Specifications (Phase 1)

1. Customer and Location Records

   As an Operations Administrator, I add a customer and the locations it receives linen at, so that routes and invoices have something to point to.
   - A customer has a name, a billing address, a billing contact and one or more locations.
   - A location has a delivery address, delivery notes (for example, "use the rear door after 6 am"), a depot and a delivery window.
   - A location lists the products it rents and its par level for each, meaning the count that should be on hand after a delivery.
   - Customers and locations can be deactivated, not deleted, so old deliveries keep their history.

   As a Dispatcher, I search for a location by name or address and open its details, so that I can answer a driver's question quickly.
   - Search matches part of a name or address.
   - The location page shows its upcoming stops and its last ten deliveries.

   User Roles this applies to:
   - Operations Administrator
   - Dispatcher

   Technical Notes:
   - Import the initial customers and locations from Brightfold's spreadsheets once, at launch.

2. Users, Roles and Location Access

   As an Operations Administrator, I create users and give each one a role, so that people see only what their job needs.
   - Roles are Operations Administrator, Dispatcher, Billing Clerk, Driver and Customer Manager.
   - A Dispatcher and a Billing Clerk belong to one depot and see only that depot's drivers, routes, locations and deliveries.
   - A Customer Manager belongs to one customer and sees only the locations of that customer that the administrator assigned to them.
   - A user can be limited to a set of locations or a set of depots, and the same role can be given different limits for different people.

   As a Dispatcher, I see only my own depot's data, so that I am not distracted by the other two depots.

   User Roles this applies to:
   - Operations Administrator
   - Dispatcher
   - Billing Clerk
   - Customer Manager

   Technical Notes:
   - Brightfold expects a depot manager to be able to open another depot's records during a vacation cover by having an administrator widen the limit for a week.

3. Route Scheduling

   As a Dispatcher, I build tomorrow's routes by assigning stops to drivers and putting the stops in order, so that every location gets its delivery in its window.
   - A route has a date, a driver, a truck and an ordered list of stops.
   - A stop is one location with a delivery to make, a collection to make, or both.
   - A repeating schedule creates the weekly stops for a location, such as Monday and Thursday.
   - The dispatcher can move a stop to a different route until the route is started.

   As a Dispatcher, I see which routes have started, which are finished and which stops are late, so that I can phone the driver or customer before a complaint arrives.

   User Roles this applies to:
   - Dispatcher
   - Operations Administrator

4. Driver Portal: My Route

   As a Driver, I open my route on my phone and see my stops in order, so that I know where to go next.
   - The stop list shows the location name, address, delivery window and any delivery notes.
   - A button opens the address in the phone's map app.
   - A stop is marked Not started, In progress, Done or Skipped, with a reason when skipped.
   - The portal works with large buttons and short text, because drivers use it with gloves and in sunlight.
   - The route stays usable when the phone loses signal, and changes sync when signal returns.

   As a Driver, I call the location's contact from the stop, so that I can get let in.

   User Roles this applies to:
   - Driver

   Technical Notes:
   - Treat the phone as the main device. The portal's tap targets must be larger than the office screens use.

5. Driver Portal: Delivery and Collection Counts

   As a Driver, I record what I delivered and collected at a stop, so that the customer can be billed for what actually moved.
   - For each product at the location, the driver enters a delivered count and a collected count.
   - The expected delivered count comes from the location's par level and the soiled count on the last visit. The driver can change it.
   - The driver can add a photo of the delivery and a note.
   - The driver submits the stop, which locks the counts for the driver and sends them to review.
   - A customer manager at the location can sign on the driver's phone to confirm the counts on the spot, if they are there.

   User Roles this applies to:
   - Driver

6. Delivery Review Workflow

   As a Dispatcher, I review each submitted stop's counts against the route and the location's usual counts, so that mistakes are caught before billing.
   - Submitted stops wait in a Dispatcher Review list for the depot.
   - The dispatcher can approve a stop or send it back to the driver with a reason. A sent-back stop reopens in the driver's portal with the reason shown, and the driver corrects and resubmits it.
   - A stop whose counts differ from the usual by more than a set percentage is flagged for the dispatcher.

   As a Billing Clerk, I review stops the dispatcher approved, so that the invoice lines are right.
   - The billing clerk can approve a stop, which creates its invoice lines, or send it back to the dispatcher with a reason.
   - A stop sent back by the billing clerk returns to Dispatcher Review, and the dispatcher can fix it, approve it again or send it on to the driver.
   - Every approval and send-back is kept with who did it, when, and the reason.

   As an Operations Administrator, I see how many stops sit at each step and how long they wait, so that I can find the bottleneck.

   User Roles this applies to:
   - Dispatcher
   - Billing Clerk
   - Driver
   - Operations Administrator

   Technical Notes:
   - A stop moves through Submitted, Dispatcher Approved and Billed. A send-back moves it one step back.

7. Customer Portal: Deliveries and Approval

   As a Customer Manager, I sign in and see my locations' recent deliveries and collections, so that I know what Brightfold says it moved.
   - The portal shows each delivery with its counts, photo, driver name and time.
   - A manager can approve a delivery or dispute a count with a note and a photo.
   - A delivery nobody disputes within five days is treated as approved.
   - The manager sees the status of a dispute: Open, Under review or Resolved.
   - The portal is built for managers on a laptop or a phone at the restaurant, and is simpler and calmer than the driver portal.

   As a Customer Manager, I update the par levels for my location by requesting a change, so that my deliveries match my menu.
   - A requested par change goes to the dispatcher as a request. It does not change the par level until approved.

   User Roles this applies to:
   - Customer Manager
   - Dispatcher

8. Invoicing and Monthly Export

   As a Billing Clerk, I see the approved invoice lines for a customer for the month and build the invoice, so that the customer is billed correctly.
   - Lines come from billed stops at the price list rate for the product.
   - A clerk can add a line by hand for a fee or a credit, with a reason.
   - An invoice has a status of Draft, Sent or Paid.

   As a Billing Clerk, I export the month's invoices in the format Brightfold's accounting system imports, so that nobody retypes them.

   User Roles this applies to:
   - Billing Clerk
   - Operations Administrator

   Technical Notes:
   - Brightfold will send a sample import file from the accounting system before this item starts.

9. Discrepancies and Claims

   As a Customer Manager, I report missing or damaged linen on a delivery, so that I am credited.
   - The claim names the product, the count and the reason, and can include photos.

   As a Billing Clerk, I resolve a claim by crediting the invoice or rejecting it with a reason, so that the customer gets an answer.
   - A resolved claim creates its credit line on the next invoice.
   - The customer sees the outcome and the reason in the portal.

   User Roles this applies to:
   - Customer Manager
   - Billing Clerk

10. Reports and Delivery Data Grid

    As an Operations Administrator, I view and filter every delivery in one data grid, so that I can answer questions about counts, disputes and drivers.
    - The grid is the AG Grid data grid, which Brightfold's operations team already knows from another tool.
    - It has column grouping, pinned columns, an Excel-style set filter and a pivot mode.
    - Rows can be exported to Excel, with the columns and filters the user has set.

    As a Dispatcher, I see a weekly summary of late stops and disputes by driver, so that I can coach drivers.

    User Roles this applies to:
    - Operations Administrator
    - Dispatcher

    Technical Notes:
    - Brightfold asks for the grid by name and sees it as a requirement, because the operations team has used it for years.

## Testing & Quality Assurance

- Pell tests each item against the stories above and fixes what it finds before delivery.
- Brightfold tests in a staging environment with a small group of drivers and two customers for two weeks before launch.
- Pell tests the driver portal on the Android phones Brightfold issues, including with the connection turned off partway through a stop.

## Project Management

- A weekly status meeting between Brightfold's named contact and the Pell project lead.
- Questions are answered in writing, so decisions are recorded.
- Pell demonstrates finished items to Brightfold's operations team at the end of each two-week period.

## Phase 2 Overview

Phase 2 adds route optimization, which proposes a stop order from addresses and delivery windows, and a driver messaging feature so that dispatch can send a note to one driver or to a whole depot. It also adds text-message alerts to customers when a delivery is on its way.

## Phase 3 Overview

Phase 3 adds linen inventory tracking inside each depot, with counts of clean, soiled and in-wash stock, and a link to the laundry's wash-floor equipment. It also adds a mobile app version of the driver portal if Brightfold decides the web version is not enough.

## Out of Scope Work

- Replacing Brightfold's accounting system.
- Payment processing: customers pay Brightfold the way they do today.
- A native iPhone or Android app.
- Laundry plant and wash-floor operations.
- Training for customers' staff. Pell supplies a one-page guide only.
- Data from before the launch date, apart from the customer and location import in item 1.

## Estimated Cost

| Item | Description | Hours |
|-|-|-|
| 1 | Customer and Location Records | 32 |
| 2 | Users, Roles and Location Access | 36 |
| 3 | Route Scheduling | 44 |
| 4 | Driver Portal: My Route | 48 |
| 5 | Driver Portal: Delivery and Collection Counts | 52 |
| 6 | Delivery Review Workflow | 56 |
| 7 | Customer Portal: Deliveries and Approval | 48 |
| 8 | Invoicing and Monthly Export | 40 |
| 9 | Discrepancies and Claims | 28 |
| 10 | Reports and Delivery Data Grid | 40 |
| | Testing, project management and launch | 60 |
| | Total | 484 |
