import colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";

type ColorScheme = typeof colors.light & { radius: number };

export function useColors(): ColorScheme {
  const { isDark } = useTheme();
  const scheme = isDark ? colors.dark : colors.light;
  return { ...scheme, radius: colors.radius };
}
