const express = require("express");
const router = express.Router();
const multer = require("multer");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const os = require("os");

const Product = require("../modelList/Product");
const Category = require("../modelList/Category");
const Tag = require("../modelList/Tag");
const PricingPlan = require("../modelList/PricingPlan");
const Seo = require("../modelList/Seo");
const Location = require("../modelList/Location");
const User = require("../modelList/User");
const { verifyToken } = require("../middleware/VerifyListToken");

dotenv.config();

// Cloudflare R2 Client
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;
const PUBLIC = `https://${process.env.R2_PUBLIC_DOMAIN}`;

// Multer (2 images only)
const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, os.tmpdir()),
    filename: (_, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
  })
});

// CREATE PRODUCT
router.post(
  "/create",
  verifyToken,
  upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "gallery", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) return res.status(401).json({ ok: false, error: "Invalid user" });

      const body = req.body;

      // ❌ FRONTEND SEO NOT ALLOWED (REMOVE)
      // Backend auto SEO using title + description
      const autoSeo = {
        title: body.title,
        description: body.description.substring(0, 160)
      };
      const seo = await Seo.create(autoSeo);
      body.seo = seo._id;

      // Check duplicate product
      const exists = await Product.findOne({ title: body.title });
      if (exists)
        return res.status(400).json({ ok: false, error: "Product with this title already exists" });

      // Auto status
      body.status = user.role === "admin" ? "published" : "pending";
      body.createdBy = user._id;

      // Upload THUMBNAIL
      if (req.files?.thumbnail?.[0]) {
        const f = req.files.thumbnail[0];
        const key = `thumb-${Date.now()}${path.extname(f.originalname)}`;

        await r2.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: fs.createReadStream(f.path),
            ContentType: f.mimetype,
          })
        );

        body.thumbnail = `${PUBLIC}/${key}`;
        fs.unlinkSync(f.path);
      }

      // Upload GALLERY (1 image)
      if (req.files?.gallery?.[0]) {
        const f = req.files.gallery[0];
        const key = `gallery-${Date.now()}${path.extname(f.originalname)}`;

        await r2.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: fs.createReadStream(f.path),
            ContentType: f.mimetype,
          })
        );

        body.gallery = [`${PUBLIC}/${key}`];
        fs.unlinkSync(f.path);
      }

      // CATEGORY
      if (body.categoryId) {
        body.category = body.categoryId;
      } else if (body.newCategory) {
        const name = body.newCategory.trim();
        const slug = name.toLowerCase().replace(/\s+/g, "-");

        let cat = await Category.findOne({ slug });
        if (!cat) cat = await Category.create({ name, slug });

        body.category = cat._id;
      }

      // TAGS
      if (body.tags) {
        const tagArr = JSON.parse(body.tags);
        const ids = [];

        for (let t of tagArr) {
          const name = t.name.trim();
          const slug = name.toLowerCase().replace(/\s+/g, "-");

          let tag = await Tag.findOne({ slug });
          if (!tag) tag = await Tag.create({ name, slug });

          ids.push(tag._id);
        }

        body.tags = ids;
      }

      // PRICING PLANS
      if (body.plans) {
        const arr = JSON.parse(body.plans);
        const ids = [];
        for (let p of arr) {
          const plan = await PricingPlan.create(p);
          ids.push(plan._id);
        }
        body.plans = ids;
      }

      // LOCATION
      if (body.location) {
        const loc = await Location.create(JSON.parse(body.location));
        body.location = loc._id;
      }

      // OTHER FIELDS
      // AUTO SEO SLUG
      let slug = body.title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      const existingSlug = await Product.findOne({ slug });
      if (existingSlug) {
        slug = `${slug}-${Date.now()}`;
      }

      body.slug = slug;

      body.social = body.social ? JSON.parse(body.social) : {};
      body.team = body.team ? JSON.parse(body.team) : [];

      const product = await Product.create(body);

      return res.status(201).json({ ok: true, product });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }
);



// ================= GET SINGLE PRODUCT =================
router.get("/hello/:slug", async (req, res) => {
  try {
    const product = await Product.findOne({slug: req.params.slug})
      .populate("category")
      .populate("tags")
      .populate("plans")
      .populate("seo")
      .populate("location")
      .populate("createdBy", "username email avatar");
    if (!product)
      return res.status(404).json({ ok: false, error: "Product not found" });
    res.json({ ok: true, product });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/get/mango", async(req, res) => {

  try {

    const product = await Product.find();
    
    res.status(201).json(product);
  }
  catch(error){
    res.status(500).json(error);  }
})

// ================= GET ALL CATEGORIES =================
router.get("/categories/all", async (req, res) => {
  try {
    const categories = await Category.find();
    res.json({ ok: true, categories });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;











// const express = require("express");
// const Product = require("../modelList/Product");
// const PricingPlan = require("../modelList/PricingPlan");
// const auth = require("../middleware/VerifyToken");

// const router = express.Router();

// // -----------------------------------------
// // GENERATE SLUG
// // -----------------------------------------
// const makeSlug = (text) => {
//   return text
//     .toLowerCase()
//     .replace(/[^a-z0-9]+/g, "-")
//     .replace(/(^-|-$)+/g, "");
// };

// // -----------------------------------------
// // CREATE PRODUCT (Admin = auto approve, User = pending)
// // -----------------------------------------
// router.post("/", auth, async (req, res) => {
//   try {
//     const user = req.user; // { id, role }

//     let {
//       title,
//       description,
//       longDescription,
//       category,
//       tags,
//       thumbnail,
//       gallery,
//       videoDemo,
//       websiteUrl,
//       appStoreLink,
//       playStoreLink,
//       chromeExtension,
//       social,
//       team,
//       plans,
//       location,
//       launchStatus,
//     } = req.body;

//     const slug = makeSlug(title);

//     // Product approval logic
//     const status = user.role === "admin" ? "published" : "pending";

//     const product = await Product.create({
//       title,
//       slug,
//       description,
//       longDescription,
//       category,
//       tags,
//       thumbnail,
//       gallery,
//       videoDemo,
//       websiteUrl,
//       appStoreLink,
//       playStoreLink,
//       chromeExtension,
//       social,
//       team,
//       plans,
//       location,
//       launchStatus,
//       createdBy: user.id,
//       status,
//     });

//     res.json({
//       success: true,
//       message:
//         user.role === "admin"
//           ? "Product published successfully"
//           : "Product submitted for approval",
//       product,
//     });
//   } catch (error) {
//     res.status(500).json({ error });
//   }
// });

// // -----------------------------------------
// // GET ALL PRODUCTS WITH FILTERS + SEARCH + SORT
// // -----------------------------------------
// router.get("/", async (req, res) => {
//   try {
//     const {
//       search,
//       category,
//       tag,
//       featured,
//       sort = "latest",
//     } = req.query;

//     let query = { status: "published" };

//     if (search) query.title = { $regex: search, $options: "i" };
//     if (category) query.category = category;
//     if (tag) query.tags = tag;
//     if (featured === "true") query.featured = true;

//     let sortQuery = {};
//     if (sort === "latest") sortQuery.createdAt = -1;
//     if (sort === "trending") sortQuery.trendingScore = -1;
//     if (sort === "rating") sortQuery.avgRating = -1;

//     const products = await Product.find(query)
//       .populate("category tags plans seo location createdBy")
//       .sort(sortQuery);

//     res.json(products);
//   } catch (error) {
//     res.status(500).json({ error });
//   }
// });

// // -----------------------------------------
// // GET SINGLE PRODUCT + AUTO VIEW COUNT
// // -----------------------------------------
// router.get("/:slug", async (req, res) => {
//   try {
//     const { slug } = req.params;

//     const product = await Product.findOne({ slug })
//       .populate("category tags plans seo location createdBy team.userId");

//     if (!product)
//       return res.status(404).json({ message: "Product not found" });

//     // increase views
//     product.views += 1;
//     product.trendingScore += 2;
//     await product.save();

//     res.json(product);
//   } catch (error) {
//     res.status(500).json({ error });
//   }
// });

// // -----------------------------------------
// // CLICK COUNTER (For tracking outbound clicks)
// // -----------------------------------------
// router.post("/:id/click", async (req, res) => {
//   try {
//     const product = await Product.findById(req.params.id);

//     if (!product)
//       return res.status(404).json({ message: "Product not found" });

//     product.clicks += 1;
//     product.trendingScore += 3;
//     await product.save();

//     res.json({ success: true });
//   } catch (error) {
//     res.status(500).json({ error });
//   }
// });

// // -----------------------------------------
// // UPDATE PRODUCT (Admin or Creator Only)
// // -----------------------------------------
// router.put("/:id", auth, async (req, res) => {
//   try {
//     const user = req.user;
//     const product = await Product.findById(req.params.id);

//     if (!product)
//       return res.status(404).json({ message: "Product not found" });

//     // permission check
//     if (product.createdBy.toString() !== user.id && user.role !== "admin") {
//       return res.status(403).json({ message: "Not allowed" });
//     }

//     const updated = await Product.findByIdAndUpdate(
//       req.params.id,
//       req.body,
//       { new: true }
//     );

//     res.json({ success: true, updated });
//   } catch (error) {
//     res.status(500).json({ error });
//   }
// });

// // -----------------------------------------
// // DELETE PRODUCT (Admin or Creator Only)
// // -----------------------------------------
// router.delete("/:id", auth, async (req, res) => {
//   try {
//     const user = req.user;
//     const product = await Product.findById(req.params.id);

//     if (!product)
//       return res.status(404).json({ message: "Product not found" });

//     if (product.createdBy.toString() !== user.id && user.role !== "admin") {
//       return res.status(403).json({ message: "Not allowed" });
//     }

//     await product.deleteOne();

//     res.json({ success: true, message: "Product deleted" });
//   } catch (error) {
//     res.status(500).json({ error });
//   }
// });

// // -----------------------------------------
// // RATE PRODUCT
// // -----------------------------------------
// router.post("/:id/rate", auth, async (req, res) => {
//   try {
//     const { stars, comment } = req.body;
//     const user = req.user;

//     const product = await Product.findById(req.params.id);

//     if (!product)
//       return res.status(404).json({ message: "Product not found" });

//     // Add Rating
//     product.ratings.push({
//       userId: user.id,
//       stars,
//       comment,
//     });

//     // Update avg rating
//     const total = product.ratings.reduce((sum, r) => sum + r.stars, 0);
//     product.avgRating = total / product.ratings.length;

//     await product.save();

//     res.json({
//       success: true,
//       message: "Rating submitted",
//       avgRating: product.avgRating,
//     });
//   } catch (error) {
//     res.status(500).json({ error });
//   }
// });

// // -----------------------------------------
// // TRENDING PRODUCTS
// // -----------------------------------------
// router.get("/home/trending", async (req, res) => {
//   try {
//     const trending = await Product.find({ status: "published" })
//       .sort({ trendingScore: -1 })
//       .limit(10);

//     res.json(trending);
//   } catch (error) {
//     res.status(500).json({ error });
//   }
// });

// module.exports = router;

