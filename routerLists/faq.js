const express = require("express");
const router = express.Router();

const Faq = require("../models/Faq");
const { verifyToken, isAdmin } = require("../middlewares/VerifyToken");

// -----------------------------------------
// ⭐ CREATE FAQ (ADMIN ONLY)
// -----------------------------------------
router.post("/create", verifyToken, isAdmin, async (req, res) => {
  try {
    const { productId, question, answer } = req.body;
    if (!productId || !question || !answer)
      return res.status(400).json({ error: "Product, question and answer are required" });

    const faq = new Faq({
      product: productId,
      question,
      answer
    });

    await faq.save();

    res.json({ success: true, message: "FAQ created", faq });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create FAQ" });
  }
});

// -----------------------------------------
// ⭐ GET FAQs FOR PRODUCT
// -----------------------------------------
router.get("/product/:productId", async (req, res) => {
  try {
    const faqs = await Faq.find({ product: req.params.productId });
    res.json(faqs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch FAQs" });
  }
});

// -----------------------------------------
// ⭐ UPDATE FAQ (ADMIN ONLY)
// -----------------------------------------
router.put("/update/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const faq = await Faq.findById(req.params.id);
    if (!faq) return res.status(404).json({ error: "FAQ not found" });

    const { question, answer } = req.body;
    if (question) faq.question = question;
    if (answer) faq.answer = answer;

    await faq.save();
    res.json({ success: true, message: "FAQ updated", faq });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update FAQ" });
  }
});

// -----------------------------------------
// ⭐ DELETE FAQ (ADMIN ONLY)
// -----------------------------------------
router.delete("/delete/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const faq = await Faq.findByIdAndDelete(req.params.id);
    if (!faq) return res.status(404).json({ error: "FAQ not found" });

    res.json({ success: true, message: "FAQ deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete FAQ" });
  }
});

module.exports = router;
