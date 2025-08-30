const xlsx = require('xlsx');
const fs = require('fs');
const { PrismaClient } = require('../../generated/prisma');
const prisma = new PrismaClient();

exports.uploadExcel = async (req, res) => {
  try {
    console.log(req.file);
    const filePath = req.file.path;

    // Read Excel
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // Format rows according to Prisma Task schema
    const formatted = data.map(row => ({
  orderCo: row["Order Co"] ? Number(row["Order Co"]) : null,
  orTy: row["Or Ty"] || null,
  orderNumber: row["Order Number"] ? Number(row["Order Number"]) : null,
  branchPlant: row["Branch Plant"] || null,
  customerPO: row["Customer PO"] ? String(row["Customer PO"]) : null, // this one can be string
  suburbTown: row["Suburb/Town"] || null,
  name: row["Name"] || null,
  description: row["Description"] || null,
  quantityShipped: row["Quantity Shipped"] ? Number(row["Quantity Shipped"]) : null,
  itemNumber: row["Item Number"] ? Number(row["Item Number"]) : null,
  postalCode: row["Postal Code"] ? Number(row["Postal Code"]) : null,
  revNbr: row["Rev Nbr"] ? Number(row["Rev Nbr"]) : null,
  revisionReason: row["Revision Reason"] || null,
  routeCode: row["Route Code"] || null,
  schedPick: row["Sched Pick"] ? new Date(row["Sched Pick"]) : null,
  truckId: row["Truck I.D."] || null,
  location: row["Location"] || null,
  scheduledPickTime: row["Scheduled Pick Time"] ? Number(row["Scheduled Pick Time"]) : null,
  requestDate: row["Request Date"] ? new Date(row["Request Date"]) : null,
  soldTo: row["Sold To"] ? Number(row["Sold To"]) : null,
  shipTo: row["Ship To"] ? Number(row["Ship To"]) : null,
  deliverTo: row["Deliver To"] ? Number(row["Deliver To"]) : null,
  stateCode: row["State Code"] || null,
  lnTy: row["Ln Ty"] || null,
  descriptionLine2: row["Description Line 2"] || null,
  zoneNo: row["Zone No."] || null,
  stopCode: row["Stop Code"] || null,
  nextStat: row["Next Stat"] ? Number(row["Next Stat"]) : null,
  lastStat: row["Last Stat"] ? Number(row["Last Stat"]) : null,
  priority: row["Priority (1/0)"] ? Number(row["Priority (1/0)"]) : null,
  futureQtyCommitted: row["Future Qty Committed"] ? Number(row["Future Qty Committed"]) : null,
  quantityOrdered: row["Quantity Ordered"] ? Number(row["Quantity Ordered"]) : null,
  reasonCode: row["Reason Code"] || null,
  lineNumber: row["Line Number"] ? Number(row["Line Number"]) : null,
}));


    console.log("Formatted Data:", formatted.slice(0, 3)); // log first 3 rows

    // Bulk insert
    await prisma.task_DB.createMany({
      data: formatted,
      skipDuplicates: true, // prevents error if same row already exists
    });

    fs.unlinkSync(filePath); // clean up
    res.status(200).json({ message: "Tasks inserted into DB." });
  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
};