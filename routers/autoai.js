const express = require("express");
const axios = require("axios");
require ('dotenv').config();
const router = express.Router();
const cheerio = require("cheerio");

console.log(process.env.Google_CX_ID, " ", process.env.Google_Search_API)





router.get("/result", async(req, res) => {
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

        // console.log(results);
        // res.status(200).json(results);

        const LinkStore = {};
        results.forEach((item, index) => {
            LinkStore[index] = item.link;
        });

        console.log(LinkStore);

        const ScrapedData = [];

        // Iterate over the URLs to scrape images and other data
        for (let i = 0; i < Object.keys(LinkStore).length; i++) {
            const urlToScrape = LinkStore[i];

            try {
                const pageResponse = await axios.get(urlToScrape);
                const $ = cheerio.load(pageResponse.data);

                // Extract the title and content (article or first paragraph)
                const title = $("title").text() || $("h1").text();
                const content = $("article").text().trim() || $("p").text().trim().slice(0, 100);

                // Extract all image URLs from the page
                const images = [];
                $("img").each((index, element) => {
                    let imageUrl = $(element).attr("src");

                    // Handle relative URLs by converting them to absolute URLs
                    if (imageUrl) {
                        // If the image URL is relative, resolve it to an absolute URL
                        if (!imageUrl.startsWith('http') && !imageUrl.startsWith('https')) {
                            imageUrl = url.resolve(urlToScrape, imageUrl);
                        }
                        images.push(imageUrl);
                    }
                });

                ScrapedData.push({
                    
                    images, 
                    results
                });

                res.status(200).json("Scraping Success: ", urlToScrape);
            }
            catch(error){
            console.log(error);
            }
    }

    catch(error){
        console.log(error);
    }



})

module.exports = router;
