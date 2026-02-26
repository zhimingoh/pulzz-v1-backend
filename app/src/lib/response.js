function httpJsonResult(code, message, data) {
  return {
    Code: code,
    Message: message,
    Data: typeof data === 'string' ? data : JSON.stringify(data)
  };
}

function success(data, message = 'ok') {
  return httpJsonResult(0, message, data);
}

function failure(code, message, data = {}) {
  return httpJsonResult(code, message, data);
}

module.exports = {
  httpJsonResult,
  success,
  failure
};
