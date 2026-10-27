import { useState, useEffect } from 'react';
import {
  subscribeToMonthlyRevenues,
  subscribeToRevenueStaffRules,
  updateStaffingTarget
} from '../services/scheduler';
import type { RevenueStaffRules } from '../services/scheduler';
import { safeConfirm } from '../utils/dateUtils';

export function useStaffingRules(analysisHoursRange: number[]) {
  const [monthlyRevenues, setMonthlyRevenues] = useState<Record<number, number>>({});
  const [revenueStaffRules, setRevenueStaffRules] = useState<RevenueStaffRules>({
    tier1Limit: 1500,
    tier2Limit: 2500,
    tier3Limit: 3500,
    tier1Staff: 2,
    tier2Staff: 3,
    tier3Staff: 4,
    tier4Staff: 5,
    incrementAmount: 1000,
    maxStaff: 8
  });
  const [tempRules, setTempRules] = useState<RevenueStaffRules>({
    tier1Limit: 1500,
    tier2Limit: 2500,
    tier3Limit: 3500,
    tier1Staff: 2,
    tier2Staff: 3,
    tier3Staff: 4,
    tier4Staff: 5,
    incrementAmount: 1000,
    maxStaff: 8
  });

  useEffect(() => {
    const unsubMonthlyRevenues = subscribeToMonthlyRevenues((data) => setMonthlyRevenues(data));
    const unsubRevenueStaffRules = subscribeToRevenueStaffRules((rules) => {
      setRevenueStaffRules(rules);
      setTempRules(rules);
    });

    return () => {
      unsubMonthlyRevenues();
      unsubRevenueStaffRules();
    };
  }, []);

  const getRecommendedStaff = (dailyAvg: number, rules: RevenueStaffRules) => {
    const { tier1Limit, tier2Limit, tier3Limit, tier1Staff, tier2Staff, tier3Staff, tier4Staff, incrementAmount, maxStaff } = rules;
    if (dailyAvg <= tier1Limit) {
      return tier1Staff;
    } else if (dailyAvg <= tier2Limit) {
      return tier2Staff;
    } else if (dailyAvg <= tier3Limit) {
      return tier3Staff;
    } else {
      const extraAmount = dailyAvg - tier3Limit;
      const extraStaff = Math.floor(extraAmount / incrementAmount);
      return Math.min(maxStaff, tier4Staff + extraStaff);
    }
  };

  const handleApplyRevenuesToGlobalTargets = async () => {
    if (safeConfirm('確定要將此營業額計算出的建議人數，套用為系統的預設排班目標 (db-global) 嗎？\n這將直接覆蓋目前的預設排班人數需求。')) {
      try {
        for (const hour of analysisHoursRange) {
          const monthlyVal = monthlyRevenues[hour] || 0;
          const dailyAvg = monthlyVal / 30;
          const recommendedStaff = getRecommendedStaff(dailyAvg, revenueStaffRules);
          await updateStaffingTarget(hour, recommendedStaff);
        }
        alert('已成功將營業額建議人數套用為預設排班目標需求！');
      } catch (error) {
        console.error("Failed to apply revenue targets: ", error);
        alert('套用預設目標失敗，請重試。');
      }
    }
  };

  return {
    monthlyRevenues,
    setMonthlyRevenues,
    revenueStaffRules,
    setRevenueStaffRules,
    tempRules,
    setTempRules,
    getRecommendedStaff,
    handleApplyRevenuesToGlobalTargets
  };
}
