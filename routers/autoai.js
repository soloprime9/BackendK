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
        res.status(200).json(results);
        


    catch(error){
        console.log(error);
    }



})

module.exports = router;
