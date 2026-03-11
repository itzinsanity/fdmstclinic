'use strict';

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error.';

  if (err.name === 'CastError') {
    message = 'Resource not found.';
    statusCode = 404;
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    message = `That ${field} is already in use.`;
    statusCode = 409;
  }

  if (err.name === 'ValidationError') {
    message = Object.values(err.errors).map(e => e.message).join('. ');
    statusCode = 400;
  }

  if (process.env.NODE_ENV === 'development') {
    console.error('[Error]', err.stack);
  }

  res.status(statusCode).json({ success: false, message });
};

module.exports = errorHandler;
