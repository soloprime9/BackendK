const express = require("express")
const router = express.Router();
const Content = require("../models/Content")
const cheerio = require("cheerio");
const axios = require("axios");
require ('dotenv').config();


const { GoogleGenAI } = require("@google/genai");

const genai = new GoogleGenAI( {apiKey:process.env.Google_Gemini_API} )

let hello = [];
let images = [];
let filteredImages = [];
console.log(process.env.Google_CX_ID, " ", process.env.Google_Search_API, " ", process.env.Google_Gemini_API)

let ScrappedPushData = [];



function cleanText(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')                // Collapse multiple spaces/newlines
        .replace(/(?:\\n|\\t)+/g, ' ')       // Remove escaped newlines/tabs
        .replace(/<[^>]*>?/gm, '')           // Remove HTML tags
        .replace(/&nbsp;/g, ' ')             // Decode HTML entities
        .replace(/&#x[\dA-F]+;/gi, '')       // Remove hex HTML entities
        .replace(/&#\d+;/g, '')              // Remove decimal HTML entities
        .replace(/\b(No Content|function story_progress|window.location.href|window._taboola)\b/g, '')  // Remove unwanted words
        .replace(/http[s]?:\/\/\S+/g, '')    // Remove URLs
        .replace(/window\.\w+\(.*?\);/g, '') // Remove JavaScript window function calls
        .replace(/function\s+\w+.*?{.*?}/gs, '') // Remove JavaScript function definitions
        .replace(/javascript:/gi, '')        // Remove JavaScript links
        .replace(/[\x00-\x1F\x7F]/g, '')    // Remove control characters (ASCII 0-31 and 127)
        .replace(/(?:on\w+=["'][^"']*["'])/g, '') // Remove inline JavaScript events (like onClick)
        .replace(/eval\(.+?\)/g, '')         // Remove eval calls
        .replace(/alert\(.+?\)/g, '')        // Remove alert calls
        .replace(/console\.\w+\(.+?\)/g, '') // Remove console logs
        .replace(/setTimeout\(.+?\)/g, '')   // Remove setTimeout calls
        .replace(/setInterval\(.+?\)/g, '')  // Remove setInterval calls
        .replace(/document\.cookie/g, '')    // Remove document.cookie
        .replace(/document\.location/g, '')  // Remove document.location
        .replace(/window\.open\(.+?\)/g, '') // Remove window.open calls
        .replace(/localStorage/g, '')         // Remove localStorage calls
        .replace(/sessionStorage/g, '')       // Remove sessionStorage calls
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces
        .trim();                             // Clean up leading/trailing spaces
}


router.get("/search", async(req, res) => {
    const query = req.query.q;
    

    if(!query){
        res.status(400).json("Please Enter query");
    }

    try {

        const response = await axios.get("https://www.googleapis.com/customsearch/v1", 
            {
                params : {
                    key : process.env.Google_Search_API,
                    cx : process.env.Google_CX_ID,
                    q: query,
                    dateRestrict: 'd[1]',
                    sort: 'date',
                    filter: '1',
                    start: '1'
                },
            }
        );

        
        const results = response.data.items.map(item => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet,
            displayLink: item.displayLink,
            mime: item.mime || null,
            thumbnail: item.pagemap?.cse_thumbnail?.[0]?.src || null,
            cse_image: item.pagemap?.cse_image?.[0]?.src || null,
            tags: item.pagemap?.metatags || null

        }))

        images = results.map(item => item.cse_image).filter(Boolean);
        filteredImages = images.filter(url =>
            /^https?:\/\/.+\.(jpg|jpeg|png|webp|gif|bmp)(\?.*)?$/i.test(url)
          );
        console.log(images);
        

        
        const LinkStore = {};
        results.forEach((item,index) => {
            LinkStore[index] = item.link;
        })

        console.log(LinkStore);

        const ScrapedData = [];

        // for(i=0; i<Object.keys(LinkStore).length; i++)

        for (let i = 0; i < 10; i++){
            const url = LinkStore[i];
            
            
            try {
                const response = await axios.get(url);
                const $ = cheerio.load(response.data);

                // Extract title and content 

                // const title = $("title").text() || $("h1").text();
                const content = $("article").text().trim() || $("p").text().trim();

                // Split content into words and extract exactly the first 10
                const contentFirst10Words = content.split(/\s+/).slice(0, 200).join(' ');
                
                ScrapedData.push({
                    
                    content: contentFirst10Words

                })

                console.log("Scraping Success: ", url)
                

            }
            catch(error){
                console.log(`Scraping Error ${url}:`, error.message);
                
            }
        }

        

        ScrappedPushData = ScrapedData;
    }



    catch(error){
        console.log(error);
    }

    
    if(ScrappedPushData.length > 0){
    console.log("Scraped", ScrappedPushData);
    }

    try{

        
        console.log("helloQuery", query);

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: `You are a professional social media content creator.
          
          The user has searched for: "${query}"
          
          Using:
          1. Your own internal Google Gemini database.
          2. This newly scraped data from multiple web sources: ${JSON.stringify(ScrappedPushData)}
          
          Create **6 short, original, engaging social media posts** for Instagram, Twitter, and Facebook based on this topic. You MUST use both sources — your own database and the scraped data — to ensure all information is latest, relevant, and valuable.
          
          🧠 Rules:
          - ✅ Do NOT hallucinate or invent information.
          - ✅ Use only factual and current data, avoid any outdated or generic text.
          - ✅ Include new and fresh information if available.
          - ✅ Make ONE of the 6 posts longer (around 100 words), giving a full detailed view or story.
          - ✅ Keep the other 5 posts short (max 50 words), crisp, catchy, and valuable.
          - ✅ Include 2 relevant hashtags and 1–2 emojis in each post.
          - ✅ Return ONLY a valid JSON array, like: ["Post 1...", "Post 2...", ..., "Post 6..."]
          - ❌ No markdown, explanations, formatting, or other text outside the array.
          
          Begin now.`,
          });
          

          
          const datacollect = await  response.text;
          const cleaningodData = datacollect.replace(/```json\n|\n```/g, '');
          const posts = JSON.parse(cleaningodData)
          
          
          hello = (posts)
          
          res.status(200).json(posts);

          if(hello){
            console.log("hello Dear", hello);
          }
          
    }
    catch(error){
        res.json(error);
    }

    if(hello){
        console.log("hello dear", hello);
    }

    try{

        
        if(hello && hello.length > 0 && images && images.length>0){

            const existcontent = await Content.find({content: {$in : hello}}).distinct("content");

            const newContent = hello.filter((item) => !existcontent.includes(item));
            

            const helloElement = newContent.map((item, index) => {
                const image = filteredImages[index] || null; 
                
                return {
                    content: item, 
                    imageURL : image,
                    unique: true,
                }
                }

            );

            if(helloElement.length){

                const detailupload = await Content.insertMany(helloElement);

                
                return res.status(200).json(detailupload);

            }
            else{
                return res.send("Post Already available please, Try another to post")
            }

        }

        else{
            return res.send("please Try Again....")
        }
        
    }
    catch(error){
        return console.log(error);
    }



})







router.get("/gen", async(req,res) => {

    

    // if(!prompt){
    //     res.status(400).json({message:"Please Enter Prompt !!! "})
    // }
    

    if(res.status(400)){
        console.log("Error Coming of 400")
    }

    try{

        
        

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: `You are a professional social media post creator. Based on the topic: "${ScrappedPushData}", create up to 6 short, engaging posts for Instagram, Twitter, and Facebook.

                        ✨ Important:
                        - Return ONLY a valid JSON array.
                        - Format like: ["Post 1...", "Post 2...", "Post 3...", "Post 4...", "Post 5...", "Post6..."]
                        - Do not include explanations, markdown, or formatting.
                        - Include 2 hashtags, emojis, and make each post clear, define full story and valuable.

                        Begin now:
                    `,
          });

          
          const datacollect = await  response.text;
          const cleaningodData = datacollect.replace(/```json\n|\n```/g, '');
          const posts = JSON.parse(cleaningodData)
          
          
          hello = (posts)
          
          res.status(200).json(posts);

          if(hello){
            console.log("hello Dear", hello);
          }
          
    }
    catch(error){
        console.log(error)
    }

   


})




router.get("/get", async(req, res) => {
    
    try{
    const detail = await Content.find();

    if(detail.length === 0){
        return res.status(400).json("Content not found");
    }
    

    
    

    return res.status(200).json(detail);

    }
    catch(error){
        return res.send(error);

    }
    
})

// router.post("/create", async(req, res) => {
//     const content = req.body;

//     if(hello){
//         console.log("hello dear", hello);
//     }

//     try{

        
//         if(hello.length>0){

//             const existcontent = await Content.find({content: {$in : hello}}).distinct("content");

//             const newContent = hello.filter((item) => !existcontent.includes(item));
            

//             const helloElement = newContent.map((item) => ({content: item, unique: true}));

//             if(helloElement.length){

//                 const detailupload = await Content.insertMany(helloElement);

//                 console.log(detailupload);
//                 res.send(detailupload)

//             }
//             else{
//                 res.send("Post Already available please, Try another to post")
//             }

//         }

//         else{
//             res.send("please Try Again....")
//         }
        
//     }
//     catch(error){
//         console.log(error);
//     }
// })


router.get("/post/:id", async(req, res) =>{
    
   try{
    const{ id } = req.params;
    const celect = await Content.findById(id);
    if(!celect){
        return res.status(400).json("Post not found");

    }
    res.status(200).json(celect)

   }
   catch(error){
    console.log(error)
   }

})

module.exports = router;
