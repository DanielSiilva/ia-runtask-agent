(async () => {
  try {
    let { a, b } = value;
    await util.createData("teste01", { a, b });
    await util.systemSuccess("Data saved successfully", "saveDataToTeste01", {
      data: value,
    });
  } catch (error) {
    await util.systemError(error.message, "saveDataToTeste01", { data: value });
    throw error;
  }
})();
