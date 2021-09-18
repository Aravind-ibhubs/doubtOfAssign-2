const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
const dbPath = path.join(__dirname, "twitterClone.db");
app.use(express.json());

let database = null;
const startServerAndDb = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at port http://localhost:3000/");
    });
  } catch (error) {
    console.log(`the database error is ${error.message}`);
    process.exit(1);
  }
};
startServerAndDb();

const authentication = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "CHANDU", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const isValidPassword = password.length > 5;

  const isExistQuery = `
    SELECT 
       *
    FROM 
      user
    WHERE
      name = '${username}';`;

  const userArray = await database.get(isExistQuery);

  if (userArray === undefined) {
    if (isValidPassword === true) {
      const hashedPassword = await bcrypt.hash(password, 14);
      const postQuery = `
            INSERT INTO 
            user(name,username,password,gender)
            VALUES
            ('${name}','${username}','${hashedPassword}','${gender}');`;
      await database.run(postQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const isExistQuery = `
    SELECT 
       *
    FROM
      user
    WHERE
      username = '${username}';`;

  const userArray = await database.get(isExistQuery);

  if (userArray === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isCorrectPassword = await bcrypt.compare(
      password,
      userArray.password
    );
    if (isCorrectPassword === false) {
      response.status(400);
      response.send("Invalid password");
    } else {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "My_Access_Token");
      response.send({ jwtToken });
      console.log(jwtToken);
      login_user_id = userArray.user_id;
    }
  }
});

app.get("/user/tweets/feed/", authentication, async (request, response) => {
  let { username } = request;

  const getQuery = `
    SELECT user.username,tweet.tweet,tweet.date_time AS dateTime
    FROM user INNER JOIN tweet ON
    user.user_id = tweet.user_id 
    LIMIT 4;`;

  const resultArray = await database.all(getQuery);
  response.send(resultArray);
});

app.get("/user/following/", authentication, async (request, response) => {
  let { username } = request;
  const loggedUserQuery = `SELECT * FROM user WHERE username = ${username};`;
  const loggedArray = await database.get(loggedUserQuery);

  const followingQuery = `
    SELECT 
       DISTINCT name
    FROM 
    user INNER JOIN follower ON
    user.user_id = follower.follower_user_id
    WHERE
      follower_user_id = ${loggedArray.user_id} ;`;

  const detailsArray = await database.all(followingQuery);
  response.send(detailsArray);
});

app.get("/user/followers/", authentication, async (request, response) => {
  let { username } = request;
  const loggedUserQuery = `SELECT * FROM user WHERE username=${username};`;
  const loggedArray = await database.get(loggedUserQuery);
  const followerQuery = `
    SELECT
       DISTINCT name
    FROM 
       user INNER JOIN follower ON
       user.user_id = follower.follower_user_id
    WHERE
      follower_user_id = ${loggedArray.user_id}
    ;`;

  const followerArray = await database.all(followerQuery);
  response.send(followerArray);
});

app.get("/tweets/:tweetId/", authentication, async (request, response) => {
  let { username } = request;
  const { tweetId } = request.params;

  const loggedUserQuery = `SELECT * FROM user WHERE username=${username};`;
  const loggedArray = await database.get(loggedUserQuery);

  const followingQuery = `
  SELECT 
       DISTINCT user_id
    FROM 
    user INNER JOIN follower ON
    user.user_id = follower.follower_user_id
    WHERE
      follower_user_id = ${loggedArray.user_id} ;`;
  const followingList = await database.all(followingQuery);

  const tweetIdQuery = `
  SELECT 
     *
    FROM
       tweet
    WHERE
       tweet_id = ${tweetId};`;
  const tweetArray = await database.get(tweetIdQuery);

  const isFollowing = followingList.includes(tweetArray.user_id);

  if (isFollowing === false) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(tweetArray);
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  async (request, response) => {
    let { username } = request;
    const { tweetId } = request.params;

    const loggedUserQuery = `SELECT * FROM user WHERE username=${username};`;
    const loggedArray = await database.get(loggedUserQuery);

    const followingQuery = `
    SELECT 
       DISTINCT user_id
    FROM 
    user INNER JOIN follower ON
    user.user_id = follower.follower_user_id
    WHERE
      follower_user_id = ${loggedArray.user_id} ;`;
    const followingList = await database.all(followingQuery);

    const tweetQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;
    const tweetArray = await database.get(tweetQuery);

    const isFollowing = followingList.includes(tweetArray.user_id);
    if (isFollowing === true) {
      const likesQuery = `
        SELECT 
          username
        FROM
          user
        WHERE
          user_id IN
        (SELECT
          user_id
        FROM
           like
        WHERE
           tweet_id = ${tweetId});`;
      const likesArray = await database.all(likesQuery);

      response.send(likesArray);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  async (request, response) => {
    let { username } = request;
    const { tweetId } = request.params;

    const loggedUserQuery = `SELECT * FROM user WHERE username=${username};`;
    const loggedArray = await database.get(loggedUserQuery);

    const tweetUserId = `SELECT user_id FROM tweet WHERE tweet_id=${tweetId};`;
    const tweetArray = await database.get(tweetUserId);
    const followerQuery = `
    SELECT 
        following_user_id 
    FROM 
       follower 
    WHERE
      follower_user_id='${loggedArray.user_id}';`;
    const followingList = await database.all(followerQuery);
    const followerArray = followingList.map((eachCard) => eachCard.user_id);

    const isFollowing = followerArray.includes(tweetArray.user_id);
    if (isFollowing === false) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getUserIdQuery = `
        select
            user_id
        from 
            reply
        where tweet_id = '${tweetId}';`;
      const userIdList = await data.all(getUserIdQuery);
      userIdArr = userIdList.map((i) => i.user_id);
      const getUsersWhoReplied = `
        SELECT 
            name,
            reply
        FROM    
            user natural join reply
        WHERE   
            user_id IN (${userIdArr});
      `;
      const repliedUsers = await database.all(getUsersWhoReplied);
      response.send({ replies: repliedUsers });
    }
  }
);

app.get("/user/tweets/", authentication, async (request, response) => {
  let { username } = request;
  const getQuery = `SELECT * FROM user WHERE username=${username};`;
  const userArray = await database.get(getQuery);
  const getTweetQuery = `
    SELECT
       tweet,COUNT(DISTINCT like_id) AS likes,COUNT(DISTINCT reply_id) AS replies,date_time AS dateTime
    FROM
      (tweet INNER JOIN reply on tweet.tweet_id = reply.tweet_id) AS tweet_reply
      INNER JOIN like on tweet_reply.tweet_id = like.tweet_id
    GROUP BY
       tweet.tweet_id;`;

  const tweetArray = await database.all(getTweetQuery);
  response.send(tweetArray);
});

app.post("/user/tweets/", authentication, async (request, response) => {
  let { username } = request;
  const { tweet } = request.body;

  const loggedQuery = `
  SELECT * FROM user WHERE username='${username}';`;
  const userArray = await database.get(loggedQuery);

  const date = new Date();
  const cDate =
    date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
  const cTime =
    date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
  const postDateTime = cDate + " " + cTime;

  const postTweetQuery = `
    INSERT INTO
       tweet(tweet,user_id,date_time)
    VALUES
       ('${tweet}',${userArray.user_id},'${postDateTime}');`;

  await database.run(postTweetQuery);
  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  let { username } = request;
  const { tweetId } = request.params;

  const loggedQuery = `SELECT
                           *
                        FROM
                          user
                        WHERE
                          username = '${username}';`;
  const userArray = await database.get(loggedQuery);
  const previousQuery = `
     SELECT 
        *
     FROM
       tweet
     WHERE
       tweet_id = ${tweetId};`;

  const tweetArray = await database.get(previousQuery);

  if (tweetArray.user_id === userArray.user_id) {
    const deleteQuery = `
        DELETE FROM
            tweet
        WHERE
           tweet_id = ${tweet_id};`;

    await database.run(deleteQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
