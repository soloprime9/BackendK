const express = require("express");
const router = express.Router();

// Curated FondPeace Digital Store Catalog (2026 Production Edition)
const STORE_PRODUCTS = [
  {
    id: "stickmotion-studio",
    title: "🎬 StickMotion AI: Turnkey Stickman & Motion Director Studio",
    subtitle: "150+ High-Retention Story Scripts, 1-Click Zero-Terminal Setup, Character Consistency Prompts & 1,000+ SFX Audio Pack",
    category: "video",
    badge: "🔥 VIRAL CREATOR STUDIO",
    rating: 5.0,
    priceUSD: 19,
    originalPriceUSD: 69,
    image: "/images/products/stickmotion-studio.png",
    topmateUrl: "https://topmate.io/fondpeace",
    problemSolved: "Enables non-technical creators to run stickman and motion animation tools on Android, iPhone, Windows and Mac with zero coding.",
    deliverables: "Android/iOS Cloud Studio + CapCut mobile templates + Windows/Mac launcher + 150+ story scripts + 5 character styles + 1,000+ SFX vault + monetization guide",
    commercialRights: true
  },
  {
    id: "ai-developer-cursor-vault",
    title: "⚡ The 2026 AI Developer & Cursor Agent Prompt System",
    subtitle: "50+ Production .cursorrules, Claude 3.5 Sonnet & Gemini 2.5 Pro High-Context Coding Frameworks",
    category: "prompts",
    badge: "🔥 2026 BESTSELLER",
    rating: 5.0,
    priceUSD: 19,
    originalPriceUSD: 69,
    image: "/images/products/cursor-agent-vault.png",
    topmateUrl: "https://topmate.io/fondpeace",
    problemSolved: "Eliminates AI coding hallucinations, memory leaks, and broken imports.",
    deliverables: "50+ .cursorrules + 25+ Architecture Prompts + Bug Hunter templates",
    commercialRights: true
  },
  {
    id: "jobcraft-copilot",
    title: "💼 JobCraft AI Career & Portfolio Engine",
    subtitle: "Interactive Next.js 15 Portfolio Template & ATS-Compliant Markdown Resume Generator",
    category: "saas",
    badge: "🚀 CAREER ACCELERATOR",
    rating: 5.0,
    priceUSD: 24,
    originalPriceUSD: 79,
    image: "/images/products/jobcraft-copilot.png",
    topmateUrl: "https://topmate.io/fondpeace",
    problemSolved: "Helps developers stand out with dynamic GitHub stats and ATS-scoring resumes.",
    deliverables: "Next.js 15 template + ATS resume parser + GitHub live metrics widget",
    commercialRights: true
  },
  {
    id: "video-automation-studio",
    title: "🎬 Viral Video & CapCut Automation Factory",
    subtitle: "The Automated Hook, Script & CapCut/FFmpeg System for Reels, Shorts & TikTok",
    category: "video",
    badge: "📱 100K+ VIEWS SYSTEM",
    rating: 5.0,
    priceUSD: 15,
    originalPriceUSD: 49,
    image: "/images/products/video-automation-studio.png",
    topmateUrl: "https://topmate.io/fondpeace",
    problemSolved: "Cuts video creation time from 4 hours to 30 mins and saves $50/mo voice subscriptions.",
    deliverables: "300+ viral hooks + retention script prompts + free Edge-TTS voice setups",
    commercialRights: true
  },
  {
    id: "designcraft-studio",
    title: "🎨 DesignCraft Pro Canvas & Thumbnail Studio",
    subtitle: "Turnkey Graphic Engine & 150+ High-CTR YouTube/Instagram Thumbnail Presets",
    category: "saas",
    badge: "🖼️ CREATIVE STUDIO",
    rating: 5.0,
    priceUSD: 19,
    originalPriceUSD: 59,
    image: "/images/products/designcraft-studio.png",
    topmateUrl: "https://topmate.io/fondpeace",
    problemSolved: "Self-hosted zero-latency canvas editor that replaces expensive Canva subscriptions.",
    deliverables: "HTML5 canvas engine + 150+ thumbnail templates + batch exporter",
    commercialRights: true
  },
  {
    id: "solopreneur-ai-prompts",
    title: "💰 100+ Production AI Prompts for Solopreneurs & Founders",
    subtitle: "High-Converting Copywriting, Cold Outreach, Programmatic SEO & Investor Pitch Templates",
    category: "prompts",
    badge: "📈 REVENUE MULTIPLIER",
    rating: 5.0,
    priceUSD: 9,
    originalPriceUSD: 29,
    image: "/images/products/solopreneur-prompts.png",
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
