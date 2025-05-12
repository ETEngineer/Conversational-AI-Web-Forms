const User = require('../models/User');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

exports.register = asyncHandler(async (req, res, next) => {
  console.log(req.body);
  const { name, email, password } = req.body;

  const user = await User.create({
    name,
    email,
    password,
  });

  sendTokenResponse(user, 200, res);
});

exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new ErrorResponse('Please provide an email and password', 400));
  }

  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  sendTokenResponse(user, 200, res);
});

const sendTokenResponse = (user, statusCode, res) => {
  const token = user.generateAuthToken();
  const cookieExpireDays = parseInt(process.env.JWT_COOKIE_EXPIRE, 10);
  const expiresInMs = (isNaN(cookieExpireDays) ? 30 : cookieExpireDays) * 24 * 60 * 60 * 1000;

  const options = {
    expires: new Date(Date.now() + expiresInMs),
    httpOnly: true,
  };

  res.status(statusCode).cookie('token', token, options).json(
    {
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      }
    }
  );
}; 