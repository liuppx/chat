import { useEffect, useState } from "react";
import { IconButton } from "./button";
import { List, ListItem } from "./ui-lib";
import CloseIcon from "../icons/close.svg";
import styles from "./my-center.module.scss";
import { useNavigate } from "react-router-dom";
import { Path } from "../constant";
import Locale from "../locales";
import { fetchQuota, WebDAVQuota } from "../plugins/webdav";

const mockProfile = {
  phone: "+86 138****5678",
  email: "user@example.com",
};

const mockUsage = {
  totalCost: "¥128.50",
  totalTokens: "2,450,000",
};

export function Centers() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<
    "storage" | "info" | "usage" | "service"
  >("storage");

  const tabs = [
    { key: "storage", label: Locale.MyCenter.Tab1.Title },
    { key: "info", label: Locale.MyCenter.Tab2.Title },
    { key: "usage", label: Locale.MyCenter.Tab3.Title },
    { key: "service", label: Locale.MyCenter.Tab4.Title },
  ];

  const [storageQuota, setStorageQuota] = useState<WebDAVQuota | null>(null);

  useEffect(() => {
    const loadQuota = async () => {
      const quota = await fetchQuota();
      if (quota) {
        setStorageQuota(quota);
      }
    };
    loadQuota();
  }, []);

  return (
    <div>
      <div className="window-header" data-tauri-drag-region>
        <div className="window-header-title">
          <div className="window-header-main-title">
            {Locale.MyCenter.Title}
          </div>
          <div className="window-header-sub-title">
            {Locale.MyCenter.SubTitle}
          </div>
        </div>
        <div className="window-actions">
          <div className="window-action-button"></div>
          <div className="window-action-button"></div>
          <div className="window-action-button">
            <IconButton
              aria={Locale.UI.Close}
              icon={<CloseIcon />}
              onClick={() => navigate(Path.Home)}
              bordered
            />
          </div>
        </div>
      </div>

      <div className={styles["profile"]}>
        {/* Tab 导航 */}
        <div className={styles["tabs"]}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`${styles["tab"]} ${
                activeTab === tab.key ? styles["active"] : ""
              }`}
              onClick={() => setActiveTab(tab.key as any)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 内容 */}
        <div className={styles["tab-content"]}>
          {activeTab === "storage" && (
            <List>
              <ListItem
                title={Locale.MyCenter.Tab1.Info.Total}
                subTitle={
                  storageQuota?.quota === undefined
                    ? "-"
                    : storageQuota?.quota + "GB"
                }
              />
              <ListItem
                title={Locale.MyCenter.Tab1.Info.Used}
                subTitle={
                  storageQuota?.used === undefined
                    ? "-"
                    : storageQuota?.used + "GB"
                }
              />
              <ListItem
                title={Locale.MyCenter.Tab1.Info.Remain}
                subTitle={
                  storageQuota?.available === undefined
                    ? "-"
                    : storageQuota?.available + "GB"
                }
              />
            </List>
          )}

          {activeTab === "info" && (
            <List>
              <ListItem
                title={Locale.MyCenter.Tab2.Info.Telephone}
                subTitle={mockProfile.phone}
              />
              <ListItem
                title={Locale.MyCenter.Tab2.Info.Email}
                subTitle={mockProfile.email}
              />
            </List>
          )}

          {activeTab === "usage" && (
            <List>
              <ListItem
                title={Locale.MyCenter.Tab3.Info.Moneys}
                subTitle={mockUsage.totalCost}
              />
              <ListItem
                title={Locale.MyCenter.Tab3.Info.Tokens}
                subTitle={mockUsage.totalTokens}
              />
            </List>
          )}

          {activeTab === "service" && (
            <List>
              <ListItem
                title={Locale.MyCenter.Tab4.Info.StorageExpansion}
                subTitle={Locale.MyCenter.Tab4.Info.Desc1}
              >
                <IconButton
                  text={Locale.MyCenter.Tab4.Info.ImmediatelyExpandCapacity}
                  type="primary"
                  onClick={() => console.log(`go to new page`)}
                />
              </ListItem>
              <ListItem
                title={Locale.MyCenter.Tab4.Info.TopUpBalance}
                subTitle={Locale.MyCenter.Tab4.Info.Desc2}
              >
                <IconButton
                  text={Locale.MyCenter.Tab4.Info.GotoRecharge}
                  type="primary"
                  onClick={() => {
                    window.location.href = "#";
                  }}
                />
              </ListItem>
            </List>
          )}
        </div>
      </div>
    </div>
  );
}
