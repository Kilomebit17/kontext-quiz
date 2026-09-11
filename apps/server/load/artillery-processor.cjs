// Artillery processor: gives every virtual user a unique nickname.
/* global module */
let counter = 0
module.exports = {
  setNickname(context, _events, done) {
    counter += 1
    context.vars.nickname = `art${counter}-${Math.floor(Math.random() * 1000)}`
    return done()
  },
}
