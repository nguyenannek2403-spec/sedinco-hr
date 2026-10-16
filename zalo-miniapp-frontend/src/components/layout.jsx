import { getSystemInfo } from "zmp-sdk";
import {
  AnimationRoutes,
  App,
  Route,
  SnackbarProvider,
  ZMPRouter,
} from "zmp-ui";

import HomePage from "../pages/index";

const Layout = () => {
  let theme = "light";
  try {
    const info = getSystemInfo();
    if (info?.zaloTheme) {
      theme = info.zaloTheme;
    }
  } catch (e) {
    theme = "light";
  }

  return (
    <App theme={theme}>
      <SnackbarProvider>
        <ZMPRouter>
          <AnimationRoutes>
            <Route path="/" element={<HomePage />}></Route>
          </AnimationRoutes>
        </ZMPRouter>
      </SnackbarProvider>
    </App>
  );
};
export default Layout;

