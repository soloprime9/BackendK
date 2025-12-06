const express = require("express");
const router = express.Router();

const Category = require("../models/Category");
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
// ⭐ ADMIN: CREATE CATEGORY
// -----------------------------------------
router.post("/create", verifyToken, isAdmin, async (req, res) => {
  try {
    let { name, icon, description } = req.body;

    if (!name)
      return res.status(400).json({ error: "Category name is required" });

    const slug = slugify(name);

    // Check for duplicate slug
    const exists = await Category.findOne({ slug });
    if (exists)
      return res.status(400).json({ error: "Category already exists" });

    const category = new Category({
      name,
      slug,
      icon: icon || "",
      description: description || "",
    });

    await category.save();

    res.json({
      success: true,
      message: "Category created successfully",
      category,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Create failed" });
  }
});

// -----------------------------------------
// ⭐ ADMIN: UPDATE CATEGORY
// -----------------------------------------
router.put("/update/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const { name, icon, description } = req.body;

    const category = await Category.findById(req.params.id);
    if (!category)
      return res.status(404).json({ error: "Category not found" });

    if (name) {
      category.name = name;
      category.slug = slugify(name);
    }

    if (icon !== undefined) category.icon = icon;
    if (description !== undefined) category.description = description;

    await category.save();

    res.json({
      success: true,
      message: "Category updated successfully",
      category,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Update failed" });
  }
});

// -----------------------------------------
// ⭐ ADMIN: DELETE CATEGORY
// -----------------------------------------
router.delete("/delete/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);

    if (!category)
      return res.status(404).json({ error: "Category not found" });

    res.json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
});

// -----------------------------------------
// ⭐ GET ALL CATEGORIES
// -----------------------------------------
router.get("/all", async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: "Cannot fetch categories" });
  }
});

// -----------------------------------------
// ⭐ GET SINGLE CATEGORY BY SLUG
// -----------------------------------------
router.get("/:slug", async (req, res) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug });

    if (!category)
      return res.status(404).json({ error: "Category not found" });

    res.json(category);
  } catch (err) {
    res.status(500).json({ error: "Cannot fetch category" });
  }
});

module.exports = router;
