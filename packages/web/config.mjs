const stage = process.env.SST_STAGE || "dev"

export default {
  url: "#",
  console: "#",
  email: "help@anoma.ly",
  socialCard: "https://social-cards.sst.dev",
  github: "#",
  discord: "#",
  headerLinks: [
    { name: "app.header.home", url: "/" },
    { name: "app.header.docs", url: "/docs/" },
  ],
}
