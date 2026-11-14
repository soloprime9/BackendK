const express = require("express");
const router = express.Router();

// Curated FondPeace Digital Store Catalog (2026 Production Edition)
const STORE_PRODUCTS = [
  {
    id: "ai-developer-cursor-vault",
    title: "The 2026 AI Developer & Cursor Agent Prompt System",
    subtitle: "50+ Production .cursorrules, Claude 3.5 Sonnet & Gemini 2.5 Pro High-Context Coding Frameworks",
    category: "prompts",
    badge: "🔥 2026 BESTSELLER",
    rating: 4.98,
    reviewsCount: 342,
    priceUSD: 19,
    originalPriceUSD: 69,
    topmateUrl: "https://topmate.io/fondpeace",
    problemSolved: "Eliminates AI coding hallucinations, memory leaks, and broken imports.",
    deliverables: "50+ .cursorrules + 25+ Architecture Prompts + Bug Hunter templates",
    commercialRights: true
  },
  {
    id: "saas-launch-kit-24h",
    title: "The 24-Hour AI SaaS Launch Blueprint & Production Kit",
    subtitle: "Full-Stack Next.js 15, Auth, Stripe/Razorpay Webhooks & Turnkey SaaS Dashboard",
    category: "saas",
    badge: "⚡ LAUNCH THIS WEEKEND",
    rating: 4.95,
    reviewsCount: 289,
    priceUSD: 29,
    originalPriceUSD: 99,
    topmateUrl: "https://topmate.io/fondpeace",
    problemSolved: "Skip 3+ weeks of boilerplate auth and payment webhook setup.",
    deliverables: "Production Next.js 15 boilerplate + Stripe/Razorpay webhooks + landing page",
    commercialRights: true
  },
  {
    id: "viral-video-faceless-engine",
    title: "Viral AI Content & Faceless Video Creation Engine",
    subtitle: "The Automated Hook, Script & CapCut/FFmpeg System for Reels, Shorts & TikTok",
    category: "video",
    badge: "📱 100K+ VIEWS SYSTEM",
    rating: 4.93,
    reviewsCount: 215,
    priceUSD: 15,
    originalPriceUSD: 49,
    topmateUrl: "https://topmate.io/fondpeace",
    problemSolved: "Cuts video creation time from 4 hours to 30 mins and saves $50/mo voice subscriptions.",
    deliverables: "300+ viral hooks + retention script prompts + free Edge-TTS voice setups",
    commercialRights: true
  },
  {
    id: "solopreneur-ai-prompts",
    title: "100+ Production AI Prompts for Solopreneurs & Founders",
    subtitle: "High-Converting Copywriting, Cold Outreach, Programmatic SEO & Investor Pitch Templates",
    category: "prompts",
    badge: "💼 REVENUE MULTIPLIER",
    rating: 4.91,
    reviewsCount: 167,
    priceUSD: 9,
    originalPriceUSD: 29,
    topmateUrl: "https://topmate.io/fondpeace",
    problemSolved: "Write landing pages, cold emails, and programmatic SEO articles without hiring agencies.",
    deliverables: "35+ sales copywriting prompts + 25+ outreach scripts + programmatic SEO blueprints",
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
      currency: "USD",
      payoutMethods: ["UPI", "IMPS/NEFT", "Stripe Global Cards"],
      ruralBankSupport: true
    }
  });
});

module.exports = router;
