'use strict';

const line = require('@line/bot-sdk');
const express = require('express');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
require('dotenv').config();

// LINE Bot Setting
const config = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET
};
const client = new line.Client(config);

// base URL for webhook server
const baseURL = process.env.BASE_URL;

// express
const app = new express();
const port = 3000;

// serve static and downloaded files
app.use('/static', express.static('static'));
app.use('/downloaded', express.static('downloaded'));

// root
app.get('/', (req, res) => {
    console.log('Root Accessed!');
    res.send('Hello World!');
});

// LINE Bot webhook callback [POST only]
app.post('/linebot', line.middleware(config), (req, res) => {
    console.log('LINE Bot webhook callback handle function called!');
    if (req.body.destination) {
        console.log("Destination User ID: " + req.body.destination);
    }
    // req.body.events should be an array of events
    if (!Array.isArray(req.body.events)) {
        return res.status(500).end();
    }
    // handle each event
    Promise
        .all(req.body.events.map(handleEvent))
        .then(() => res.end())
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});

// callback function to handle a single event
function handleEvent(event) {
    if (event.replyToken && event.replyToken.match(/^(.)\1*$/)) {
        return console.log("Test hook recieved: " + JSON.stringify(event.message));
    }
    // handle event
    switch (event.type) {
        // handle message event
        case 'message':
            const message = event.message;
            switch (message.type) {
                // handle Text message
                case 'text':
                    return handleText(message, event.replyToken, event.source);
                // handle Image message
                case 'image':
                    return handleImage(message, event.replyToken);
                // handle Video message
                case 'video':
                    return handleVideo(message, event.replyToken);
                // handle Audio message
                case 'audio':
                    return handleAudio(message, event.replyToken);
                // handle Location message
                case 'location':
                    return handleLocation(message, event.replyToken);
                // handle Sticker(スタンプ) message
                case 'sticker':
                    return handleSticker(message, event.replyToken);
                // unknown message
                default:
                    throw new Error(`Unknown message: ${JSON.stringify(message)}`);
            }
        // handle follow(友だち追加) event
        case 'follow':
            return replyText(event.replyToken, 'お友だち追加ありがとうございます！');
        // handle unfollow(ブロック) event
        case 'unfollow':
            return console.log(`Unfollowed this bot: ${JSON.stringify(event)}`);
        // handle join(グループ参加) event
        case 'join':
            return replyText(event.replyToken, `Joined ${event.source.type}`);
        // handle leave(グループ退室) event
        case 'leave':
            return console.log(`Left: ${JSON.stringify(event)}`);
        // handle Postback event
        case 'postback':
            let data = event.postback.data;
            // for date time picker
            if (data === 'DATE' || data === 'TIME' || data === 'DATETIME') {
                data += `(${JSON.stringify(event.postback.params)})`;
            }
            return replyText(event.replyToken, `Got postback: ${data}`);
        // handle beacon event
        case 'beacon':
            return replyText(event.replyToken, `Got beacon: ${event.beacon.hwid}`);
        // unknown event
        default:
            throw new Error(`Unknown event: ${JSON.stringify(event)}`);
    }
}

// simple reply function
const replyText = (token, texts) => {
    texts = Array.isArray(texts) ? texts : [texts];
    return client.replyMessage(
        token,
        texts.map((text) => ({ type: 'text', text }))
    );
};

function handleText(message, replyToken, event_source) {
    console.log('handleText function called!');
    return replyText(replyToken, message.text);
}

function handleLocation(message, replyToken) {
    console.log('handleLocation function called!');
    return client.replyMessage(
        replyToken,
        {
            type: 'location',
            title: message.title,
            address: message.address,
            latitude: message.latitude,
            longitude: message.longitude,
        }
    );
}

function handleSticker(message, replyToken) {
    console.log('handleSticker function called!');
    return client.replyMessage(
        replyToken,
        {
            type: 'sticker',
            packageId: message.packageId,
            stickerId: message.stickerId,
        }
    );
}

function handleImage(message, replyToken) {
    console.log('handleImage function called!');
    let getContent;
    if (message.contentProvider.type === "line") {
        const downloadPath = path.join(__dirname, 'downloaded', `${message.id}.jpg`);
        const previewPath = path.join(__dirname, 'downloaded', `${message.id}-preview.jpg`);
        getContent = downloadContent(message.id, downloadPath)
            .then((downloadPath) => {
                return {
                    originalContentUrl: baseURL + '/downloaded/' + path.basename(downloadPath),
                    previewImageUrl: baseURL + '/downloaded/' + path.basename(downloadPath),
                };
            });
    } else if (message.contentProvider.type === "external") {
        getContent = Promise.resolve(message.contentProvider);
    }

    return getContent
        .then(({ originalContentUrl, previewImageUrl }) => {
            return client.replyMessage(
                replyToken,
                {
                    type: 'image',
                    originalContentUrl,
                    previewImageUrl,
                }
            );
        });
}

function handleVideo(message, replyToken) {
    console.log('handleVideo function called!');
    let getContent;
    if (message.contentProvider.type === "line") {
        const downloadPath = path.join(__dirname, 'downloaded', `${message.id}.mp4`);
        getContent = downloadContent(message.id, downloadPath)
            .then((downloadPath) => {
                return {
                    originalContentUrl: baseURL + '/downloaded/' + path.basename(downloadPath),
                    previewImageUrl: baseURL + '/downloaded/preview.png'
                }
            });
    } else if (message.contentProvider.type === "external") {
        getContent = Promise.resolve(message.contentProvider);
    }

    return getContent
        .then(({ originalContentUrl, previewImageUrl }) => {
            return client.replyMessage(
                replyToken,
                {
                    type: 'video',
                    originalContentUrl,
                    previewImageUrl,
                }
            );
        });
}

function handleAudio(message, replyToken) {
    console.log('handleAudio function called!');
    let getContent;
    if (message.contentProvider.type === "line") {
        const downloadPath = path.join(__dirname, 'downloaded', `${message.id}.m4a`);

        getContent = downloadContent(message.id, downloadPath)
            .then((downloadPath) => {
                return {
                    originalContentUrl: baseURL + '/downloaded/' + path.basename(downloadPath),
                };
            });
    } else {
        getContent = Promise.resolve(message.contentProvider);
    }

    return getContent
        .then(({ originalContentUrl }) => {
            return client.replyMessage(
                replyToken,
                {
                    type: 'audio',
                    originalContentUrl,
                    duration: message.duration,
                }
            );
        });
}

function downloadContent(messageId, downloadPath) {
    console.log('downloadContent function called!');
    return client.getMessageContent(messageId)
        .then((stream) => new Promise((resolve, reject) => {
            const writable = fs.createWriteStream(downloadPath);
            stream.pipe(writable);
            stream.on('end', () => resolve(downloadPath));
            stream.on('error', reject);
        }));
}

// run express server
app.listen(port, () => {
    console.log(`Server running on ${port}`)
});
