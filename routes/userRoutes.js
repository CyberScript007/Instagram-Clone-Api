const express = require("express");
const AuthController = require("../Controller/AuthController");
const UserController = require("../Controller/UserController");

const postRoutes = require("./Post/postRoutes");
const followRoutes = require("./followRoutes");
const suggestionRoutes = require("./suggestionRoutes");

const router = express.Router();

// sign up routes
router.post("/signup", AuthController.signup);

// verify otp and sign in routes
router.post("/verify-otp", AuthController.verifyOtp);

// login user
router.post("/login", AuthController.login);

// resend otp number for user
router.post("/resend-otp", AuthController.resendOtp);

// using merger params to link the followRoutes and postRoutes with the user url
router.use("/:userId", followRoutes, postRoutes);

// nested suggestion routes
router.use("/", suggestionRoutes);

router.use(AuthController.protectedRoute);
router.use(AuthController.restrictTo("admin", "user"));

// get all user
router
  .route("/")
  .get(UserController.getAllUsers)
  .post(UserController.createUser);

router.get("/search", UserController.searchUser);

// chain all routes that will require user id
router
  .route("/:id")
  .get(UserController.getUser)
  .patch(UserController.updateUser)
  .delete(UserController.deleteUser);

module.exports = router;
