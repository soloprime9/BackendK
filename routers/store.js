const express = require("express");
const router = express.Router();

// Curated FondPeace Digital Store Catalog
const STORE_PRODUCTS = [
  {
    id: "prompt-vault-2026",
    title: "The 2026 AI Developer & Cursor Prompt Vault",
    subtitle: "50+ Production .cursorrules, Claude 3.5 Sonnet & Gemini 2.5 Pro Blueprints",
    category: "prompts",
    badge: "🔥 2026 BESTSELLER",
    rating: 4.98,
    reviewsCount: 342,
    priceINR: 299,
    originalPriceINR: 999,
    priceUSD: 7,
    originalPriceUSD: 25,
    topmateUrl: "https://topmate.io/fondpeace",
    deliverables: "Instant Markdown (.md) + PDF Package + Raw .cursorrules Files",
    commercialRights: true
  },
  {
    id: "moneyprinter-turbo",
    title: "MoneyPrinter Turbo Pro v2.6",
    subtitle: "Turnkey AI Faceless Video Pipeline & 4K Shorts Engine",
    category: "video",
    badge: "⚡ VIRAL REELS GENERATOR",
    rating: 4.95,
    reviewsCount: 289,
    priceINR: 499,
    originalPriceINR: 1499,
    priceUSD: 39,
    originalPriceUSD: 89,
    topmateUrl: "https://topmate.io/fondpeace",
    deliverables: "Full Python Source Code + Docker Compose (.zip, 185 MB)",
    commercialRights: true
  },
  {
    id: "postiz-enterprise",
    title: "Postiz Enterprise Social Stack v1.9",
    subtitle: "Self-Hosted Social Media Scheduler & Creator CRM",
    category: "saas",
    badge: "📱 PRODUCTION SAAS",
    rating: 4.92,
    reviewsCount: 176,
    priceINR: 599,
    originalPriceINR: 1999,
    priceUSD: 49,
    originalPriceUSD: 99,
    topmateUrl: "https://topmate.io/fondpeace",
    deliverables: "Enterprise Fullstack Codebase (.zip, 142 MB)",
    commercialRights: true
  },
  {
    id: "jobcraft-portfolio",
    title: "JobCraft AI Portfolio & Resume Engine",
    subtitle: "Automated GitHub Profile & Interactive Developer Portfolio",
    category: "saas",
    badge: "💼 CAREER ACCELERATOR",
    rating: 4.89,
    reviewsCount: 145,
    priceINR: 399,
    originalPriceINR: 999,
    priceUSD: 29,
    originalPriceUSD: 59,
    topmateUrl: "https://topmate.io/fondpeace",
    deliverables: "Production Template Repository (.zip, 68 MB)",
    commercialRights: true
  },
  {
    id: "designcraft-studio",
    title: "DesignCraft Pro Studio v0.12",
    subtitle: "Self-Hosted Creative Asset & Viral Thumbnail Studio",
    category: "saas",
    badge: "🎨 CREATIVE ENGINE",
    rating: 4.87,
    reviewsCount: 118,
    priceINR: 449,
    originalPriceINR: 1199,
    priceUSD: 35,
    originalPriceUSD: 69,
    topmateUrl: "https://topmate.io/fondpeace",
    deliverables: "Full Studio Codebase (.zip, 84 MB)",
    commercialRights: true
  }
];

// GET /store/products
router.get("/products", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
  res.json({
    success: true,
    count: STORE_PRODUCTS.length,
    products: STORE_PRODUCTS,
    storeInfo: {
      name: "FondPeace Digital Store",
      domain: "fondpeace.com/store",
      currencySupport: ["INR", "USD"],
      payoutMethods: ["UPI", "IMPS/NEFT", "Stripe Global Cards"],
      ruralBankSupport: true
    }
  });
});

module.exports = router;
