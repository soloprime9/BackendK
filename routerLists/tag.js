const express = require("express");
const router = express.Router();

const Tag = require("../models/Tag");
const { verifyToken, isAdmin } = require("../middlewares/VerifyToken");

// Utility to make slugs
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-");
}

// -----------------------------------------
// ⭐ ADMIN: CREATE TAG
// -----------------------------------------
router.post("/create", verifyToken, isAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Tag name is required" });

    const slug = slugify(name);

    // Check for duplicate
    const exists = await Tag.findOne({ slug });
    if (exists) return res.status(400).json({ error: "Tag already exists" });

    const tag = new Tag({ name, slug });
    await tag.save();

    res.json({ success: true, message: "Tag created", tag });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Create failed" });
  }
});

// -----------------------------------------
// ⭐ ADMIN: UPDATE TAG
// -----------------------------------------
router.put("/update/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const tag = await Tag.findById(req.params.id);
    if (!tag) return res.status(404).json({ error: "Tag not found" });

    const { name } = req.body;
    if (name) {
      tag.name = name;
      tag.slug = slugify(name);
    }

    await tag.save();

    res.json({ success: true, message: "Tag updated", tag });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Update failed" });
  }
});

// -----------------------------------------
// ⭐ ADMIN: DELETE TAG
// -----------------------------------------
router.delete("/delete/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const tag = await Tag.findByIdAndDelete(req.params.id);
    if (!tag) return res.status(404).json({ error: "Tag not found" });

    res.json({ success: true, message: "Tag deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// -----------------------------------------
// ⭐ GET ALL TAGS
// -----------------------------------------
router.get("/all", async (req, res) => {
  try {
    const tags = await Tag.find().sort({ name: 1 });
    res.json(tags);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Cannot fetch tags" });
  }
});

// -----------------------------------------
// ⭐ GET SINGLE TAG BY SLUG
// -----------------------------------------
router.get("/:slug", async (req, res) => {
  try {
    const tag = await Tag.findOne({ slug: req.params.slug });
    if (!tag) return res.status(404).json({ error: "Tag not found" });

    res.json(tag);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Cannot fetch tag" });
  }
});

module.exports = router;
