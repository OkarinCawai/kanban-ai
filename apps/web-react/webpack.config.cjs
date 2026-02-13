const path = require("node:path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const rootDir = __dirname;

module.exports = (env, argv) => {
  const isProd = argv.mode === "production";

  return {
    mode: isProd ? "production" : "development",
    entry: {
      main: path.resolve(rootDir, "src", "main.tsx"),
      authCallback: path.resolve(rootDir, "src", "auth", "callback.ts")
    },
    output: {
      path: path.resolve(rootDir, "dist"),
      filename: "assets/[name].js",
      clean: true
    },
    devtool: isProd ? "source-map" : "eval-cheap-module-source-map",
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx"]
    },
    module: {
      rules: [
        {
          test: /\.[jt]sx?$/,
          exclude: /node_modules/,
          use: {
            loader: "babel-loader",
            options: {
              presets: [
                [
                  "@babel/preset-env",
                  {
                    targets: "defaults"
                  }
                ],
                ["@babel/preset-react", { runtime: "automatic" }],
                "@babel/preset-typescript"
              ]
            }
          }
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"]
        }
      ]
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: path.resolve(rootDir, "index.html"),
        filename: "index.html",
        chunks: ["main"],
        inject: "body"
      }),
      new HtmlWebpackPlugin({
        template: path.resolve(rootDir, "auth", "callback.html"),
        filename: path.join("auth", "callback.html"),
        chunks: ["authCallback"],
        inject: "body"
      })
    ],
    devServer: {
      port: 3005,
      static: {
        directory: path.resolve(rootDir, "dist")
      },
      historyApiFallback: false,
      client: {
        overlay: true
      }
    }
  };
};

