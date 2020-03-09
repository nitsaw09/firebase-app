const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const express = require("express");
const os = require("os");
const path = require("path");
const Busboy = require("busboy");
const fs = require("fs");
const bodyParser = require("body-parser");
const UUID = require("uuid-v4");
const { Storage } = require("@google-cloud/storage");

// Create and Deploy Your First Cloud Functions
// https://firebase.google.com/docs/functions/write-firebase-functions

const firebaseApp = firebase.initializeApp(functions.config().firebase);

const gcs = new Storage({
  projectId: "video-chat-7e557",
  keyFilename: "config/video-chat-7e557-firebase-adminsdk-s4q5d-f25adf10ef.json"
});

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get("/api", (req, res) => {
  res.set("Cache-Control", "max-age=300", "s-maxage=600");
  const ref = firebaseApp.database().ref("user");
  return ref.once("value").then(data => data.val());
});

app.post("/api", (req, res) => {
  const ref = firebaseApp.database().ref("user");
  const { name, age } = req.body;
  return ref.push({ name, age }).then(data => res.json(data));
});

app.post("/uploadFile", (req, res) => {
  const busboy = new Busboy({ headers: req.headers });
  let uploadData = null;
  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    const filepath = path.join(os.tmpdir(), filename);
    uploadData = { file: filepath, type: mimetype };
    file.pipe(fs.createWriteStream(filepath));
  });

  busboy.on("finish", () => {
    const bucket = gcs.bucket("video-chat-7e557.appspot.com");
    let uuid = UUID();
    bucket
      .upload(uploadData.file, {
        uploadType: "media",
        metadata: {
          contentType: uploadData.type,
          metadata: {
            firebaseStorageDownloadTokens: uuid
          }
        }
      })
      .then(data => {
        let file = data[0];
        return res.status(200).json({
          bucket: bucket.name,
          fileName: file.name,
          uuid,
          url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${file.name}?alt=media&token=${uuid}`
        });
      })
      .catch(err => {
        res.status(500).json({
          error: err
        });
      });
  });
  busboy.end(req.rawBody);
});

// handling 404 error
app.use((req, res, next) => {
  const error = new Error("Not Found");
  error.status = 404;
  next(error);
});

// handling 404 & 500 error
app.use((error, req, res, next) => {
  const resStatus = error.status || 500;
  res.status(resStatus).json({
    status: resStatus,
    error: {
      message: error.message
    }
  });
  next();
});

exports.app = functions.https.onRequest(app);
