class ApiFeatures {
  constructor(queryStr, query) {
    this.queryStr = queryStr;
    this.query = query;
  }

  // filter
  filter() {
    // destructing req.query
    let queryObj = { ...this.queryStr };

    // create an array that contain some property that we don't want to filter
    const excludesField = ["sort", "page", "limit", "fields", "q"];

    // delete all excludesField value from  queryObj
    excludesField.forEach((el) => delete queryObj[el]);

    // User should be able to filter by lt,lte,gt,gte
    // 1) convert queryObj inot string
    queryObj = JSON.stringify(queryObj);

    // 2) use regular expression to allow user to filter lt,lte,gt,gte
    queryObj = queryObj.replace(/\b(lt|lte|gt|gte)\b/g, (match) => `$${match}`);

    // convert the queryObj into object and reassign it to queryObj
    queryObj = JSON.parse(queryObj);

    // reassign the query with new query value
    this.query = this.query.find(queryObj);

    // return the this key word, the this key word is pointing to the ApiFeatures
    return this;
  }

  // sort
  sort() {
    // check if the req.query consist sort query
    if (this.queryStr.sort) {
      // split the sort value with empty string if the user pass want to sort with more than one value
      const querySplit = this.queryStr.sort.split(",").join(" ");
      console.log(this.queryStr);

      // assign the query with the sort value
      this.query = this.query.sort(querySplit);
    } else {
      // sort all users with createdAt value
      this.query = this.query.sort("-createdAt");
    }

    // return the this key to chain all the method with eachother because the this key word is pointing to ApiFeatures class
    return this;
  }

  // limit fields
  limitFields() {
    if (this.queryStr.fields) {
      // split the fields value with empty string if the user want to pass more than one fields value
      const querySplit = this.queryStr.fields.split(",").join(" ");

      // assign the query with the fields value
      this.query = this.query.select(querySplit);
    } else {
      // deselect __v property by default
      this.query = this.query.select("-__v");
    }

    // return the this key to chain all the method with eachother because the this key word is pointing to ApiFeatures class
    return this;
  }

  // pagination
  pagination() {
    if (this.queryStr.page) {
      // get both the page and limit value and convert them to number
      const page = Number(this.queryStr.page) || 1;
      const limit = Number(this.queryStr.limit) || 10;

      // calaculate the skip value
      const skip = (page - 1) * limit;

      // assign query with both skip and limit value
      this.query = this.query.skip(skip).limit(limit);
    }

    // return the this key to chain all the method with eachother because the this key word is pointing to ApiFeatures class
    return this;
  }
}

module.exports = ApiFeatures;
